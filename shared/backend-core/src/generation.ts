import {
  accentPalette,
  chunkIdeasSchema,
  CHUNK_CHAR_THRESHOLD,
  CHUNK_TARGET_SIZE,
  DANISH_STOPWORDS,
  ENGLISH_STOPWORDS,
  iconPalette,
  LANGUAGE_PROFILES,
  LENGTH_LIMITS,
  packMetaSchema,
  packSchema,
  shortIdeaOutlineSchema,
  shortIdeaStoryboardSchema,
  shortsPackMetaSchema,
  type LanguageProfile,
  UNKNOWN_LANGUAGE_PROFILE,
} from "./constants";
import {
  clampText,
  countMatches,
  countWords,
  normalizeShortTitle,
  normalizeSourceMaterialText,
  slugify,
  trimText,
} from "./text";

export type JsonSchema = {
  name: string;
  schema: unknown;
};

export type GenerateLLM = (args: {
  input: string;
  max_output_tokens?: number;
  jsonSchema?: JsonSchema;
  fileBuffer?: unknown;
  fileMimeType?: string | null;
}) => Promise<{ output_text: string }>;

export type ProgressPatch = {
  step?: string;
  totalChunks?: number;
  completedChunks?: number;
  debug?: unknown;
};

export type PackFormat = "cards" | "shorts";

function hasLikelySentenceEnding(text: unknown) {
  return /(?:[.!?。！？]|다\.)["'”’)\]]*$/u.test(String(text || "").trim());
}

function isGenericSectionLabel(text: unknown) {
  const cleaned = String(text || "").trim();
  return (
    /^(?:chapter|part|section|unit|lesson|module|topic)\s+\d+(?:[a-z])?[.]?$/iu.test(cleaned) ||
    /^(?:제?\s*\d+\s*(?:장|절|부|과|편)|\d+\s*(?:장|절|부|과|편))[.]?$/u.test(cleaned)
  );
}

function looksLikeStructuredHeading(text: unknown) {
  const cleaned = String(text || "").trim();
  return (
    /^(?:chapter|part|section|unit|lesson|module|topic)\b/iu.test(cleaned) ||
    /^(?:제?\s*\d+\s*(?:장|절|부|과|편)|\d+\s*(?:장|절|부|과|편))/u.test(cleaned) ||
    /^\d+(?:\.\d+){0,3}[\])\.:-]?\s+\S/u.test(cleaned) ||
    /^[IVXLC]+[.):\s]/u.test(cleaned)
  );
}

function isMostlyUppercase(text: unknown) {
  const letters = String(text || "").match(/[A-Za-zÀ-ÖØ-Þ]/g) || [];
  if (letters.length < 3) {
    return false;
  }

  const upper = letters.filter((character) => character === character.toUpperCase()).length;
  return upper / letters.length >= 0.8;
}

function isTitleCaseHeading(text: unknown) {
  const words = String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length || words.length > 10) {
    return false;
  }

  let titleLikeCount = 0;

  words.forEach((word) => {
    if (/^[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'’-]*$/u.test(word)) {
      titleLikeCount += 1;
    }
  });

  return titleLikeCount >= Math.max(2, Math.ceil(words.length * 0.6));
}

function normalizeHeadingCandidate(text: unknown) {
  return String(text || "")
    .replace(/^[\s\-*•·▪◦]+/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

function shouldIgnoreHeadingCandidate(text: unknown) {
  return /^(?:contents|table of contents|목차)$/iu.test(String(text || "").trim());
}

function isLikelySectionHeading(
  text: unknown,
  previousLine: unknown,
  nextLine: unknown,
  languageProfile: LanguageProfile
) {
  const cleaned = normalizeHeadingCandidate(text);

  if (!cleaned || cleaned.length < 2 || cleaned.length > 90) {
    return false;
  }

  if (shouldIgnoreHeadingCandidate(cleaned) || /^[\d\s\p{P}\p{S}]+$/u.test(cleaned)) {
    return false;
  }

  if (/^[A-Za-z]\)\s+/u.test(cleaned)) {
    return false;
  }

  if (looksLikeStructuredHeading(cleaned)) {
    return true;
  }

  if (hasLikelySentenceEnding(cleaned)) {
    return false;
  }

  const wordCount = countWords(cleaned);
  const punctuationCount = countMatches(cleaned, /[,:;.!?]/g);

  if (wordCount > 10 || punctuationCount > 1) {
    return false;
  }

  const previousBlank = !normalizeHeadingCandidate(previousLine);
  const nextBlank = !normalizeHeadingCandidate(nextLine);

  if (!previousBlank && !nextBlank) {
    return false;
  }

  if (languageProfile.code === "ko") {
    return cleaned.length <= 40;
  }

  return cleaned.length <= 52 || isMostlyUppercase(cleaned) || isTitleCaseHeading(cleaned);
}

export function extractSectionHeadingHints(sourceText: string, languageProfile: LanguageProfile) {
  const lines = normalizeSourceMaterialText(sourceText)
    .split("\n")
    .map((line) => line.trim());
  const sectionHeadingHints: string[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < lines.length; index += 1) {
    const currentLine = normalizeHeadingCandidate(lines[index]);

    if (!isLikelySectionHeading(currentLine, lines[index - 1], lines[index + 1], languageProfile)) {
      continue;
    }

    let headingHint = currentLine;

    if (isGenericSectionLabel(currentLine)) {
      const nextLine = normalizeHeadingCandidate(lines[index + 1]);

      if (
        nextLine &&
        !isGenericSectionLabel(nextLine) &&
        !hasLikelySentenceEnding(nextLine) &&
        countWords(nextLine) <= 10 &&
        nextLine.length <= 52
      ) {
        headingHint = `${currentLine}: ${nextLine}`;
        index += 1;
      }
    }

    const dedupeKey = headingHint.toLocaleLowerCase(languageProfile.code === "unknown" ? "en" : undefined);
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    sectionHeadingHints.push(headingHint);

    if (sectionHeadingHints.length >= 50) {
      break;
    }
  }

  return sectionHeadingHints;
}

function countStopwords(text: string, stopwords: string[]) {
  return stopwords.reduce((total, word) => {
    const pattern = new RegExp(`\\b${word}\\b`, "g");
    return total + (text.match(pattern) || []).length;
  }, 0);
}

export function detectSourceLanguage(sourceText: string): LanguageProfile {
  const sample = String(sourceText || "").slice(0, 4000);
  const lowerSample = sample.toLowerCase();
  const hangulCount = countMatches(sample, /[\uac00-\ud7a3]/g);
  const latinCount = countMatches(sample, /[A-Za-z]/g);
  const danishCharCount = countMatches(sample, /[æøåÆØÅ]/g);
  const englishStopwordCount = countStopwords(lowerSample, ENGLISH_STOPWORDS);
  const danishStopwordCount = countStopwords(lowerSample, DANISH_STOPWORDS);

  if (hangulCount >= 20 || hangulCount > Math.max(8, latinCount * 0.15)) {
    return LANGUAGE_PROFILES.ko;
  }

  if (danishCharCount >= 2 || danishStopwordCount >= englishStopwordCount + 2) {
    return LANGUAGE_PROFILES.da;
  }

  if (englishStopwordCount >= 3 && englishStopwordCount >= danishStopwordCount) {
    return LANGUAGE_PROFILES.en;
  }

  return UNKNOWN_LANGUAGE_PROFILE;
}

function normalizeCoverLines(lines: unknown, title: string, languageProfile: LanguageProfile) {
  const fromModel = Array.isArray(lines)
    ? lines
        .map((line) => clampText(trimText(line, ""), LENGTH_LIMITS.coverLine))
        .filter(Boolean)
        .slice(0, 3)
    : [];

  if (fromModel.length === 3) {
    return fromModel;
  }

  const words = trimText(title, languageProfile.defaults.title).split(" ");
  if (words.length >= 3) {
    return [
      words.slice(0, 2).join(" ") || languageProfile.defaults.coverLines[0],
      words.slice(2, 4).join(" ") || languageProfile.defaults.coverLines[1],
      words.slice(4).join(" ") || languageProfile.defaults.coverLines[2],
    ];
  }

  return [
    languageProfile.defaults.coverLines[0],
    languageProfile.defaults.coverLines[1],
    languageProfile.defaults.coverLines[2],
  ];
}

function normalizeReflectionPrompt(prompt: unknown, languageProfile: LanguageProfile) {
  const cleaned = clampText(
    trimText(prompt, languageProfile.defaults.reflectionPrompt),
    LENGTH_LIMITS.reflectionPrompt
  );

  if (!cleaned) {
    return languageProfile.defaults.reflectionPrompt;
  }

  if (languageProfile.code === "ko") {
    return cleaned
      .replace(/하나씩\s*(적어\s*보세요|적어보세요|써\s*보세요|써보세요)/gu, "하나씩 떠올려 보세요")
      .replace(
        /하나씩\s*(소리\s*내어\s*말해\s*보세요|소리내어말해보세요|말해\s*보세요|말해보세요)/gu,
        "하나씩 떠올려 보세요"
      )
      .replace(
        /(적어\s*보세요|적어보세요|써\s*보세요|써보세요|기록해\s*보세요|기록해보세요|메모해\s*보세요|메모해보세요|소리\s*내어\s*말해\s*보세요|소리내어말해보세요|말해\s*보세요|말해보세요)/gu,
        "생각해 보세요"
      );
  }

  if (languageProfile.code === "en") {
    return cleaned
      .replace(/\b(write down|jot down|type out)\b/giu, "think through")
      .replace(/\b(say out loud|say aloud|speak aloud)\b/giu, "think through")
      .replace(/\bwrite\b/giu, "think about")
      .replace(/\blist\b/giu, "think through");
  }

  if (languageProfile.code === "da") {
    return cleaned
      .replace(/\b(skriv ned|noter)\b/giu, "tænk over")
      .replace(/\b(sig det højt|sig højt)\b/giu, "tænk over")
      .replace(/\bskriv\b/giu, "tænk over");
  }

  return cleaned;
}

function normalizeDurationSec(durationSec: unknown, fallback = 75) {
  const parsed = Number(durationSec);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(60, Math.min(90, Math.round(parsed)));
}

function normalizeIdeaDurationSec(durationSec: unknown, fallback = 150) {
  const parsed = Number(durationSec);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(45, Math.min(300, Math.round(parsed)));
}

function normalizeShortClipDurationSec(durationSec: unknown, fallback = 45) {
  const parsed = Number(durationSec);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(25, Math.min(90, Math.round(parsed)));
}

function normalizeSceneEstimatedSec(value: unknown, fallback = 12) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(6, Math.min(30, Math.round(parsed)));
}

function normalizeShortQuizQuestions(rawQuiz: any, languageProfile: LanguageProfile) {
  const rawQuestions = Array.isArray(rawQuiz?.questions) ? rawQuiz.questions : [];
  const normalized = rawQuestions
    .map((question: any, index: number) => {
      const options = normalizePracticeOptions(question?.options, languageProfile);
      const correctIndex = Math.max(0, Math.min(2, Number(question?.correctIndex || 0)));
      const shuffled = shuffleQuestionOptions(options, correctIndex);

      return {
        id: `quiz-${index + 1}`,
        question: clampText(
          trimText(question?.question, defaultsQuestion(languageProfile)),
          LENGTH_LIMITS.practiceQuestion
        ),
        options: shuffled.options,
        correctIndex: shuffled.correctIndex,
        explanation: clampText(
          trimText(question?.explanation, languageProfile.defaults.practiceExplanation),
          LENGTH_LIMITS.practiceExplanation
        ),
      };
    })
    .filter((question: any) => question.question && question.options.length === 3)
    .slice(0, 3);

  while (normalized.length < 3) {
    normalized.push({
      id: `quiz-${normalized.length + 1}`,
      question: languageProfile.defaults.practiceQuestion,
      options: [...languageProfile.defaults.practiceOptions],
      correctIndex: 0,
      explanation: languageProfile.defaults.practiceExplanation,
    });
  }

  return normalized;
}

function normalizeTtsMetadata(tts: any) {
  const segments = Array.isArray(tts?.segments)
    ? tts.segments
        .map((segment: any, index: number) => ({
          id: trimText(segment?.id, `segment-${index + 1}`),
          sceneId: trimText(segment?.sceneId, ""),
          order: Math.max(1, Math.round(Number(segment?.order || index + 1))),
          text: trimText(segment?.text, ""),
          startMs: Math.max(0, Math.round(Number(segment?.startMs || 0))),
          endMs: Math.max(0, Math.round(Number(segment?.endMs || 0))),
        }))
        .filter((segment: any) => segment.text)
        .sort((left: any, right: any) => left.order - right.order)
    : [];

  return {
    provider: clampText(trimText(tts?.provider, "gemini-tts"), LENGTH_LIMITS.ttsProvider) || "gemini-tts",
    voice: clampText(trimText(tts?.voice, ""), LENGTH_LIMITS.ttsVoice),
    audioPath: clampText(trimText(tts?.audioPath, ""), LENGTH_LIMITS.ttsAudioPath),
    durationMs: Math.max(0, Math.round(Number(tts?.durationMs || 0))),
    audioStatus: trimText(tts?.audioStatus, "pending"),
    segments,
    signedUrlPath: trimText(tts?.signedUrlPath, ""),
  };
}

function normalizeShortScenes(
  rawScenes: any[],
  ideaId: string,
  languageProfile: LanguageProfile,
  options: { minScenes?: number; maxScenes?: number } = {}
) {
  const minScenes = Math.max(1, Math.round(Number(options.minScenes || 4)));
  const maxScenes = Math.max(minScenes, Math.round(Number(options.maxScenes || 7)));
  const normalized = Array.isArray(rawScenes)
    ? rawScenes
        .map((scene: any, index: number) => ({
          id: trimText(scene?.id, `${ideaId}-scene-${index + 1}`),
          order: Math.max(1, Math.min(7, Math.round(Number(scene?.order || index + 1)))),
          headline: clampText(
            trimText(scene?.headline, `${languageProfile.defaults.shortSceneHeadline} ${index + 1}`),
            LENGTH_LIMITS.sceneHeadline
          ),
          body: clampText(trimText(scene?.body, languageProfile.defaults.shortSceneBody), LENGTH_LIMITS.sceneBody),
          narration: clampText(
            trimText(scene?.narration, scene?.body || languageProfile.defaults.shortSceneBody),
            LENGTH_LIMITS.sceneNarration
          ),
          callouts: Array.isArray(scene?.callouts)
            ? scene.callouts
                .map((callout: unknown) => clampText(trimText(callout, ""), LENGTH_LIMITS.sceneCallout))
                .filter(Boolean)
                .slice(0, 4)
            : [],
          captionLines: Array.isArray(scene?.captionLines)
            ? scene.captionLines
                .map((line: unknown) => clampText(trimText(line, ""), LENGTH_LIMITS.sceneCaptionLine))
                .filter(Boolean)
                .slice(0, 3)
            : [],
          emphasisWords: Array.isArray(scene?.emphasisWords)
            ? scene.emphasisWords
                .map((word: unknown) => clampText(trimText(word, ""), LENGTH_LIMITS.sceneEmphasisWord))
                .filter(Boolean)
                .slice(0, 4)
            : [],
          visualStyle: clampText(trimText(scene?.visualStyle, "clean PPT slide"), LENGTH_LIMITS.sceneVisualStyle),
          layoutHint: clampText(trimText(scene?.layoutHint, "headline-left, diagram-right"), LENGTH_LIMITS.sceneLayoutHint),
          motionHint: clampText(
            trimText(scene?.motionHint, languageProfile.defaults.shortSceneMotionHint),
            LENGTH_LIMITS.sceneMotionHint
          ),
          transitionHint: clampText(
            trimText(scene?.transitionHint, languageProfile.defaults.shortSceneTransitionHint),
            LENGTH_LIMITS.sceneTransitionHint
          ),
          estimatedSec: normalizeSceneEstimatedSec(scene?.estimatedSec),
        }))
        .filter((scene: any) => scene.headline || scene.body || scene.narration)
        .sort((left: any, right: any) => left.order - right.order)
        .slice(0, maxScenes)
    : [];

  const fallbackScenes = normalized.length > 0 ? normalized : [
    {
      id: `${ideaId}-scene-1`,
      order: 1,
      headline: languageProfile.defaults.shortSceneHeadline,
      body: languageProfile.defaults.shortSceneBody,
      narration: languageProfile.defaults.shortSceneBody,
      callouts: [languageProfile.defaults.shortSceneCallout],
      captionLines: [languageProfile.defaults.shortSceneCaptionLine],
      emphasisWords: [languageProfile.defaults.shortSceneCallout],
      visualStyle: "clean PPT slide",
      layoutHint: "headline-left, diagram-right",
      motionHint: languageProfile.defaults.shortSceneMotionHint,
      transitionHint: languageProfile.defaults.shortSceneTransitionHint,
      estimatedSec: 12,
    },
  ];

  while (fallbackScenes.length < minScenes) {
    const nextIndex = fallbackScenes.length + 1;
    fallbackScenes.push({
      id: `${ideaId}-scene-${nextIndex}`,
      order: nextIndex,
      headline: `${languageProfile.defaults.shortSceneHeadline} ${nextIndex}`,
      body: languageProfile.defaults.shortSceneBody,
      narration: languageProfile.defaults.shortSceneBody,
      callouts: [languageProfile.defaults.shortSceneCallout],
      captionLines: [languageProfile.defaults.shortSceneCaptionLine],
      emphasisWords: [languageProfile.defaults.shortSceneCallout],
      visualStyle: "clean PPT slide",
      layoutHint: "headline-left, diagram-right",
      motionHint: languageProfile.defaults.shortSceneMotionHint,
      transitionHint: languageProfile.defaults.shortSceneTransitionHint,
      estimatedSec: 12,
    });
  }

  return fallbackScenes.slice(0, maxScenes).map((scene, index) => ({
    ...scene,
    id: trimText(scene.id, `${ideaId}-scene-${index + 1}`),
    order: index + 1,
    callouts: scene.callouts.length > 0 ? scene.callouts : [languageProfile.defaults.shortSceneCallout],
    captionLines:
      Array.isArray(scene.captionLines) && scene.captionLines.length > 0
        ? scene.captionLines
        : [scene.headline || languageProfile.defaults.shortSceneCaptionLine],
    emphasisWords:
      Array.isArray(scene.emphasisWords) && scene.emphasisWords.length > 0
        ? scene.emphasisWords
        : (scene.callouts || []).slice(0, 2),
    motionHint: trimText(scene.motionHint, languageProfile.defaults.shortSceneMotionHint),
    transitionHint: trimText(scene.transitionHint, languageProfile.defaults.shortSceneTransitionHint),
  }));
}

function buildNarrationScriptFromScenes(scenes: Array<{ headline: string; narration: string }>) {
  return scenes
    .map((scene) => [scene.headline, scene.narration].filter(Boolean).join(": "))
    .join("\n\n")
    .trim();
}

function normalizeShortClip(rawClip: any, ideaId: string, clipIndex: number, languageProfile: LanguageProfile) {
  const baseTitle = clampText(
    trimText(rawClip?.title, `${languageProfile.defaults.lessonTitle} ${clipIndex + 1}`)
      .replace(/^(?:제?\s*\d+\s*(?:장|절|부|과|편)|chapter\s+\d+|part\s+\d+|section\s+\d+)[.:]?\s*/iu, "")
      .replace(/^\d+(?:\.\d+)*[\])\.:\-]?\s+/u, ""),
    LENGTH_LIMITS.ideaTitle
  );
  const clipId = slugify(baseTitle, `${ideaId}-clip-${clipIndex + 1}`);
  const scenes = normalizeShortScenes(rawClip?.scenes || [], clipId, languageProfile, {
    minScenes: 2,
    maxScenes: 7,
  });
  const tts = normalizeTtsMetadata(rawClip?.tts);
  const requestedCoverSceneId = trimText(rawClip?.coverSceneId, scenes[0]?.id || "");
  const requestedCoverSceneOrderMatch = requestedCoverSceneId.match(/^scene-(\d+)$/i);
  const requestedCoverSceneByOrder = requestedCoverSceneOrderMatch
    ? scenes[Math.max(0, Number(requestedCoverSceneOrderMatch[1]) - 1)]?.id
    : "";
  const coverSceneId = scenes.some((scene) => scene.id === requestedCoverSceneId)
    ? requestedCoverSceneId
    : requestedCoverSceneByOrder || scenes[0]?.id || `${clipId}-scene-1`;

  return {
    id: clipId,
    title: baseTitle,
    teaser: clampText(trimText(rawClip?.teaser, languageProfile.defaults.teaser), LENGTH_LIMITS.teaser),
    durationSec: normalizeShortClipDurationSec(rawClip?.durationSec),
    hook: clampText(trimText(rawClip?.hook, languageProfile.defaults.shortHook), LENGTH_LIMITS.shortHook),
    learningGoal: clampText(
      trimText(rawClip?.learningGoal, languageProfile.defaults.shortLearningGoal),
      LENGTH_LIMITS.shortLearningGoal
    ),
    targetPlatform: clampText(
      trimText(rawClip?.targetPlatform, languageProfile.defaults.shortTargetPlatform),
      LENGTH_LIMITS.shortTargetPlatform
    ),
    videoStyle: clampText(
      trimText(rawClip?.videoStyle, languageProfile.defaults.shortVideoStyle),
      LENGTH_LIMITS.shortVideoStyle
    ),
    captionStyle: clampText(
      trimText(rawClip?.captionStyle, languageProfile.defaults.shortCaptionStyle),
      LENGTH_LIMITS.shortCaptionStyle
    ),
    musicCue: clampText(
      trimText(rawClip?.musicCue, languageProfile.defaults.shortMusicCue),
      LENGTH_LIMITS.shortMusicCue
    ),
    coverSceneId: clampText(coverSceneId, LENGTH_LIMITS.shortCoverSceneId),
    narrationScript: clampText(
      trimText(rawClip?.narrationScript, buildNarrationScriptFromScenes(scenes)),
      LENGTH_LIMITS.shortNarrationScript
    ),
    scenes,
    tts,
    video: rawClip?.video && typeof rawClip.video === "object" ? { ...rawClip.video } : undefined,
  };
}

function getRawShortClipSources(rawIdea: any) {
  if (Array.isArray(rawIdea?.clips) && rawIdea.clips.length > 0) {
    return rawIdea.clips;
  }

  if (!rawIdea?.short) {
    return [];
  }

  return [
    {
      title: rawIdea?.title,
      teaser: rawIdea?.teaser,
      durationSec: rawIdea?.durationSec,
      ...(rawIdea.short || {}),
    },
  ];
}

function normalizeShortIdea(rawIdea: any, index: number, languageProfile: LanguageProfile) {
  const baseTitle = clampText(
    trimText(rawIdea?.title, `${languageProfile.defaults.lessonTitle} ${index + 1}`)
      .replace(/^(?:제?\s*\d+\s*(?:장|절|부|과|편)|chapter\s+\d+|part\s+\d+|section\s+\d+)[.:]?\s*/iu, "")
      .replace(/^\d+(?:\.\d+)*[\])\.:\-]?\s+/u, ""),
    LENGTH_LIMITS.ideaTitle
  );
  const ideaId = slugify(baseTitle, `idea-${index + 1}`);
  const rawClipSources = getRawShortClipSources(rawIdea);
  const clips = rawClipSources.map((clip: any, clipIndex: number) =>
    normalizeShortClip(clip, ideaId, clipIndex, languageProfile)
  );
  const primaryClip = clips[0] || null;
  const totalClipDurationSec = clips.reduce(
    (sum: number, clip: any) => sum + Math.max(0, Number(clip?.durationSec || 0)),
    0
  );

  return {
    id: ideaId,
    section: typeof rawIdea?.section === "string" ? rawIdea.section.slice(0, 60) : "",
    title: baseTitle,
    icon: iconPalette[index % iconPalette.length],
    teaser: clampText(trimText(rawIdea?.teaser, languageProfile.defaults.teaser), LENGTH_LIMITS.teaser),
    durationSec: normalizeIdeaDurationSec(rawIdea?.durationSec, totalClipDurationSec || 150),
    short: primaryClip ? { ...primaryClip } : null,
    clips,
    quiz: {
      questions: normalizeShortQuizQuestions(rawIdea?.quiz, languageProfile),
    },
  };
}

function isShortIdeaValid(rawIdea: any) {
  const rawClipSources = getRawShortClipSources(rawIdea);
  const quizQuestions = Array.isArray(rawIdea?.quiz?.questions) ? rawIdea.quiz.questions : [];
  const durationSec = Number(rawIdea?.durationSec);

  return (
    Boolean(trimText(rawIdea?.title, "")) &&
    Number.isFinite(durationSec) &&
    durationSec >= 45 &&
    durationSec <= 300 &&
    rawClipSources.length >= 1 &&
    rawClipSources.length <= 5 &&
    rawClipSources.every((clip: any) => {
      const scenes = Array.isArray(clip?.scenes) ? clip.scenes : [];
      const clipDurationSec = Number(clip?.durationSec);

      return (
        Boolean(trimText(clip?.title, "")) &&
        Number.isFinite(clipDurationSec) &&
        clipDurationSec >= 25 &&
        clipDurationSec <= 90 &&
        Boolean(trimText(clip?.hook, "")) &&
        Boolean(trimText(clip?.learningGoal, "")) &&
        Boolean(trimText(clip?.targetPlatform, "")) &&
        Boolean(trimText(clip?.videoStyle, "")) &&
        Boolean(trimText(clip?.captionStyle, "")) &&
        Boolean(trimText(clip?.musicCue, "")) &&
        Boolean(trimText(clip?.coverSceneId, "")) &&
        Boolean(trimText(clip?.narrationScript, "")) &&
        scenes.length >= 2 &&
        scenes.length <= 7 &&
        scenes.every(
          (scene: any) =>
            trimText(scene?.headline, "") &&
            trimText(scene?.body, "") &&
            trimText(scene?.narration, "") &&
            Array.isArray(scene?.captionLines) &&
            scene.captionLines.length >= 1 &&
            trimText(scene?.motionHint, "") &&
            trimText(scene?.transitionHint, "")
        )
      );
    }) &&
    quizQuestions.length === 3 &&
    quizQuestions.every((question: any) => trimText(question?.question, "") && Array.isArray(question?.options) && question.options.length === 3)
  );
}

function normalizePracticeOptions(options: unknown, languageProfile: LanguageProfile) {
  const normalized = Array.isArray(options)
    ? options
        .map((option) => clampText(trimText(option, ""), LENGTH_LIMITS.practiceOption))
        .filter(Boolean)
        .slice(0, 3)
    : [];

  while (normalized.length < 3) {
    normalized.push(languageProfile.defaults.practiceOptions[normalized.length]);
  }

  return normalized;
}

function shuffleQuestionOptions(options: string[], correctIndex: number) {
  const safeIndex = Math.max(0, Math.min(options.length - 1, correctIndex));
  const indexed = options.map((option, index) => ({ option, isCorrect: index === safeIndex }));

  for (let index = indexed.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [indexed[index], indexed[swapIndex]] = [indexed[swapIndex], indexed[index]];
  }

  return {
    options: indexed.map((entry) => entry.option),
    correctIndex: indexed.findIndex((entry) => entry.isCorrect),
  };
}

function defaultsQuestion(languageProfile: LanguageProfile) {
  return languageProfile.defaults.practiceQuestion;
}

function normalizePracticeQuestions(rawPractice: any, languageProfile: LanguageProfile) {
  const rawQuestions =
    Array.isArray(rawPractice?.questions) && rawPractice.questions.length > 0
      ? rawPractice.questions
      : rawPractice?.question
        ? [rawPractice]
        : [];

  const questions = rawQuestions.map((question: any, index: number) => {
    const options = normalizePracticeOptions(question.options, languageProfile);
    const correctIndex = Math.max(0, Math.min(2, Number(question.correctIndex || 0)));
    const shuffled = shuffleQuestionOptions(options, correctIndex);

    return {
      id: `question-${index + 1}`,
      question: clampText(
        trimText(question.question, defaultsQuestion(languageProfile)),
        LENGTH_LIMITS.practiceQuestion
      ),
      options: shuffled.options,
      correctIndex: shuffled.correctIndex,
      explanation: clampText(
        trimText(question.explanation, languageProfile.defaults.practiceExplanation),
        LENGTH_LIMITS.practiceExplanation
      ),
    };
  });

  if (questions.length >= 5) {
    return questions.slice(0, 5);
  }

  if (questions.length > 0) {
    const paddedQuestions = [...questions];
    while (paddedQuestions.length < 5) {
      paddedQuestions.push({
        id: `question-${paddedQuestions.length + 1}`,
        question: languageProfile.defaults.practiceQuestion,
        options: [...languageProfile.defaults.practiceOptions],
        correctIndex: 0,
        explanation: languageProfile.defaults.practiceExplanation,
      });
    }
    return paddedQuestions;
  }

  return Array.from({ length: 5 }, (_, index) => ({
    id: `question-${index + 1}`,
    question: languageProfile.defaults.practiceQuestion,
    options: [...languageProfile.defaults.practiceOptions],
    correctIndex: 0,
    explanation: languageProfile.defaults.practiceExplanation,
  }));
}

function derivePackReviewQuestionsFromIdeas(ideas: any[]) {
  const selectedQuestions: any[] = [];
  const seenIds = new Set<string>();

  ideas.forEach((idea, ideaIndex) => {
    if (selectedQuestions.length >= 10) {
      return;
    }

    const practiceQuestions = Array.isArray(idea?.practice?.questions) ? idea.practice.questions : [];
    if (!practiceQuestions.length) {
      return;
    }

    const preferredQuestion = practiceQuestions[ideaIndex % practiceQuestions.length] || practiceQuestions[0];
    const normalizedId = `review-${selectedQuestions.length + 1}`;

    if (!preferredQuestion?.question || seenIds.has(preferredQuestion.id || normalizedId)) {
      return;
    }

    seenIds.add(preferredQuestion.id || normalizedId);
    selectedQuestions.push({
      id: normalizedId,
      question: preferredQuestion.question,
      options: [...(preferredQuestion.options || [])].slice(0, 3),
      correctIndex: Math.max(0, Math.min(2, Number(preferredQuestion.correctIndex || 0))),
      explanation: preferredQuestion.explanation,
    });
  });

  for (const idea of ideas) {
    if (selectedQuestions.length >= 10) {
      break;
    }

    for (const question of idea?.practice?.questions || []) {
      if (selectedQuestions.length >= 10) {
        break;
      }

      const questionId = question.id || `review-${selectedQuestions.length + 1}`;
      if (!question?.question || seenIds.has(questionId)) {
        continue;
      }

      seenIds.add(questionId);
      selectedQuestions.push({
        id: `review-${selectedQuestions.length + 1}`,
        question: question.question,
        options: [...(question.options || [])].slice(0, 3),
        correctIndex: Math.max(0, Math.min(2, Number(question.correctIndex || 0))),
        explanation: question.explanation,
      });
    }
  }

  return selectedQuestions.slice(0, 10);
}

function normalizePackReviewQuestions(rawPackReview: any, ideas: any[], languageProfile: LanguageProfile) {
  const normalizedQuestions = Array.isArray(rawPackReview?.questions)
    ? rawPackReview.questions
        .map((question: any, index: number) => {
          const options = normalizePracticeOptions(question?.options, languageProfile);
          const correctIndex = Math.max(0, Math.min(2, Number(question?.correctIndex || 0)));
          const shuffled = shuffleQuestionOptions(options, correctIndex);

          return {
            id: `review-${index + 1}`,
            question: clampText(
              trimText(question?.question, defaultsQuestion(languageProfile)),
              LENGTH_LIMITS.practiceQuestion
            ),
            options: shuffled.options,
            correctIndex: shuffled.correctIndex,
            explanation: clampText(
              trimText(question?.explanation, languageProfile.defaults.practiceExplanation),
              LENGTH_LIMITS.practiceExplanation
            ),
          };
        })
        .filter((question: any) => question.question && question.options.length === 3)
    : [];

  if (normalizedQuestions.length >= 5) {
    return normalizedQuestions;
  }

  const fallbackQuestions = derivePackReviewQuestionsFromIdeas(ideas);
  if (fallbackQuestions.length > 0) {
    return fallbackQuestions;
  }

  return Array.from({ length: 10 }, (_, index) => ({
    id: `review-${index + 1}`,
    question: languageProfile.defaults.practiceQuestion,
    options: [...languageProfile.defaults.practiceOptions],
    correctIndex: 0,
    explanation: languageProfile.defaults.practiceExplanation,
  }));
}

function collectPackText(rawPack: any) {
  const format = rawPack?.format === "shorts" ? "shorts" : "cards";
  const parts = [
    rawPack.title,
    rawPack.subtitle,
    rawPack.author,
    rawPack.category,
    rawPack.description,
    rawPack.heroLine,
    rawPack.minutesPerIdea,
    rawPack.coverLabel,
    ...(rawPack.coverLines || []),
  ];

  for (const idea of rawPack.ideas || []) {
    if (format === "shorts") {
      const clips =
        Array.isArray(idea?.clips) && idea.clips.length > 0
          ? idea.clips
          : idea?.short
            ? [{ ...idea.short, title: idea.title, teaser: idea.teaser }]
            : [];

      parts.push(idea.title, idea.teaser);
      for (const clip of clips) {
        parts.push(
          clip?.title,
          clip?.teaser,
          clip?.hook,
          clip?.learningGoal,
          clip?.narrationScript
        );
        for (const scene of clip?.scenes || []) {
          parts.push(scene.headline, scene.body, scene.narration, scene.visualStyle, scene.layoutHint);
          parts.push(...(scene.callouts || []));
        }
      }
      for (const question of idea.quiz?.questions || []) {
        parts.push(question.question, question.explanation);
        parts.push(...(question.options || []));
      }
      continue;
    }

    parts.push(idea.title, idea.duration, idea.teaser, idea.reflectionPrompt);
    for (const card of idea.lessonCards || []) {
      parts.push(card.eyebrow, card.title, card.body, card.support);
    }
    parts.push(...(idea.summaryBullets || []));
    if (idea.practice) {
      for (const question of idea.practice.questions || []) {
        parts.push(question.question, question.explanation);
        parts.push(...(question.options || []));
      }
      if (idea.practice.question) {
        parts.push(idea.practice.question, idea.practice.explanation);
        parts.push(...(idea.practice.options || []));
      }
    }
  }

  if (format === "cards" && rawPack.packReview) {
    for (const question of rawPack.packReview.questions || []) {
      parts.push(question.question, question.explanation);
      parts.push(...(question.options || []));
    }
  }

  return parts.filter(Boolean).join(" ");
}

function shouldRetryForLanguageMismatch(languageProfile: LanguageProfile, rawPack: any) {
  if (!rawPack || languageProfile.code === "en" || languageProfile.code === "unknown") {
    return false;
  }

  const combinedText = collectPackText(rawPack);
  const lowerCombinedText = combinedText.toLowerCase();
  const englishSignalCount = countStopwords(lowerCombinedText, ENGLISH_STOPWORDS);

  if (languageProfile.code === "ko") {
    const hangulCount = countMatches(combinedText, /[\uac00-\ud7a3]/g);
    return hangulCount < 20 && englishSignalCount >= 4;
  }

  if (languageProfile.code === "da") {
    const danishSignalCount =
      countMatches(combinedText, /[æøåÆØÅ]/g) + countStopwords(lowerCombinedText, DANISH_STOPWORDS);
    return danishSignalCount < 4 && englishSignalCount >= 4;
  }

  return false;
}

function normalizeCardsPack(rawPack: any, overrides: any, languageProfile: LanguageProfile) {
  const defaults = languageProfile.defaults;
  const title = normalizeShortTitle(
    trimText(rawPack.title, overrides.title || defaults.title),
    overrides.title || defaults.title,
    LENGTH_LIMITS.packTitle,
    8
  );
  const packId = slugify(title, `pack-${Date.now()}`);
  const rawIdeas = Array.isArray(rawPack?.ideas) ? rawPack.ideas : [];

  const ideas = rawIdeas.map((idea: any, index: number) => ({
    id: slugify(idea.title, `idea-${index + 1}`),
    section: typeof idea.section === "string" ? idea.section.slice(0, 60) : "",
    title: clampText(
      trimText(idea.title, `${defaults.lessonTitle} ${index + 1}`)
        .replace(/^(?:제?\s*\d+\s*(?:장|절|부|과|편)|chapter\s+\d+|part\s+\d+|section\s+\d+)[.:]?\s*/iu, "")
        .replace(/^\d+(?:\.\d+)*[\])\.:\-]?\s+/u, ""),
      LENGTH_LIMITS.ideaTitle
    ),
    duration: clampText(trimText(idea.duration, defaults.minutesPerIdea), LENGTH_LIMITS.duration),
    icon: iconPalette[index % iconPalette.length],
    teaser: clampText(trimText(idea.teaser, defaults.teaser), LENGTH_LIMITS.teaser),
    lessonCards: (idea.lessonCards || []).map((card: any, cardIndex: number) => ({
      id: `${slugify(idea.title, `idea-${index + 1}`)}-${cardIndex + 1}`,
      eyebrow: clampText(trimText(card.eyebrow, defaults.lessonEyebrow), LENGTH_LIMITS.lessonEyebrow),
      title: normalizeShortTitle(
        trimText(card.title, defaults.lessonTitle),
        defaults.lessonTitle,
        LENGTH_LIMITS.lessonTitle,
        5
      ),
      body: clampText(trimText(card.body, defaults.lessonBody), LENGTH_LIMITS.lessonBody),
      support: clampText(trimText(card.support, defaults.lessonSupport), LENGTH_LIMITS.lessonSupport),
    })),
    summaryBullets: (idea.summaryBullets || [])
      .map((bullet: unknown) => clampText(trimText(bullet, ""), LENGTH_LIMITS.summaryBullet))
      .filter(Boolean)
      .slice(0, 8),
    reflectionPrompt: normalizeReflectionPrompt(idea.reflectionPrompt, languageProfile),
    practice: {
      questions: normalizePracticeQuestions(idea.practice, languageProfile),
    },
  }));

  const packReview = {
    questions: normalizePackReviewQuestions(rawPack.packReview, ideas, languageProfile),
  };

  const accent =
    accentPalette[
      title.split("").reduce((sum, character) => sum + character.charCodeAt(0), 0) %
        accentPalette.length
    ];

  const normalizedLanguage = languageProfile.code === "unknown" ? detectSourceLanguage(collectPackText(rawPack)).code : languageProfile.code;

  return {
    id: packId,
    format: "cards",
    status: "ready",
    title,
    subtitle: clampText(trimText(rawPack.subtitle, defaults.subtitle), LENGTH_LIMITS.subtitle),
    author: clampText(trimText(rawPack.author, overrides.author || defaults.author), LENGTH_LIMITS.author),
    category: clampText(trimText(rawPack.category, overrides.category || defaults.category), LENGTH_LIMITS.category),
    description: clampText(trimText(rawPack.description, defaults.description), LENGTH_LIMITS.description),
    heroLine: clampText(trimText(rawPack.heroLine, defaults.heroLine), LENGTH_LIMITS.heroLine),
    keyIdeaCount: ideas.length,
    minutesPerIdea: clampText(
      trimText(rawPack.minutesPerIdea, defaults.minutesPerIdea),
      LENGTH_LIMITS.minutesPerIdea
    ),
    accent,
    icon: iconPalette[0],
    coverLabel: clampText(trimText(rawPack.coverLabel, defaults.coverLabel), LENGTH_LIMITS.coverLabel),
    coverLines: normalizeCoverLines(rawPack.coverLines, title, languageProfile),
    generationSteps: languageProfile.generationSteps,
    languageCode: normalizedLanguage,
    packReview,
    ideas,
  };
}

function normalizeShortsPack(rawPack: any, overrides: any, languageProfile: LanguageProfile) {
  const defaults = languageProfile.defaults;
  const title = normalizeShortTitle(
    trimText(rawPack.title, overrides.title || defaults.title),
    overrides.title || defaults.title,
    LENGTH_LIMITS.packTitle,
    8
  );
  const packId = slugify(title, `pack-${Date.now()}`);
  const rawIdeas = Array.isArray(rawPack?.ideas) ? rawPack.ideas : [];
  const ideas = rawIdeas.map((idea: any, index: number) => normalizeShortIdea(idea, index, languageProfile));
  const accent =
    accentPalette[
      title.split("").reduce((sum, character) => sum + character.charCodeAt(0), 0) %
        accentPalette.length
    ];
  const normalizedLanguage = languageProfile.code === "unknown" ? detectSourceLanguage(collectPackText(rawPack)).code : languageProfile.code;

  return {
    id: packId,
    format: "shorts",
    status: "ready",
    title,
    subtitle: clampText(trimText(rawPack.subtitle, defaults.subtitle), LENGTH_LIMITS.subtitle),
    author: clampText(trimText(rawPack.author, overrides.author || defaults.author), LENGTH_LIMITS.author),
    category: clampText(trimText(rawPack.category, overrides.category || defaults.category), LENGTH_LIMITS.category),
    description: clampText(trimText(rawPack.description, defaults.description), LENGTH_LIMITS.description),
    heroLine: clampText(trimText(rawPack.heroLine, defaults.heroLine), LENGTH_LIMITS.heroLine),
    keyIdeaCount: ideas.length,
    minutesPerIdea: clampText(
      trimText(rawPack.minutesPerIdea, "2-4 clips"),
      LENGTH_LIMITS.minutesPerIdea
    ),
    accent,
    icon: iconPalette[0],
    coverLabel: clampText(trimText(rawPack.coverLabel, defaults.coverLabel), LENGTH_LIMITS.coverLabel),
    coverLines: normalizeCoverLines(rawPack.coverLines, title, languageProfile),
    generationSteps: languageProfile.generationSteps,
    languageCode: normalizedLanguage,
    packReview: null,
    ideas,
  };
}

export function normalizePack(
  rawPack: any,
  overrides: any,
  languageProfile: LanguageProfile,
  requestedFormat: PackFormat = rawPack?.format === "shorts" ? "shorts" : "cards"
) {
  return requestedFormat === "shorts"
    ? normalizeShortsPack(rawPack, overrides, languageProfile)
    : normalizeCardsPack(rawPack, overrides, languageProfile);
}

function isChapterLevelHeading(text: string) {
  const cleaned = normalizeHeadingCandidate(text);
  return (
    /^(?:chapter|part|section|unit)\s+\d/iu.test(cleaned) ||
    /^(?:제?\s*\d+\s*(?:장|부|편)|\d+\s*(?:장|부|편))/u.test(cleaned) ||
    /^\d+(?:장|부)\b/u.test(cleaned)
  );
}

export function splitSourceIntoChunks(sourceText: string) {
  const normalized = normalizeSourceMaterialText(sourceText);
  const lines = normalized.split("\n");
  const sectionStarts = [0];

  for (let index = 1; index < lines.length; index += 1) {
    const cleaned = normalizeHeadingCandidate(lines[index]);
    if (isChapterLevelHeading(cleaned)) {
      sectionStarts.push(index);
    }
  }

  const hasMultipleChapters = sectionStarts.length >= 4;
  if (normalized.length <= CHUNK_CHAR_THRESHOLD && !hasMultipleChapters) {
    return [normalized];
  }

  const chunks: string[] = [];
  let currentLines: string[] = [];
  let currentLength = 0;

  for (let sectionIndex = 0; sectionIndex < sectionStarts.length; sectionIndex += 1) {
    const start = sectionStarts[sectionIndex];
    const end = sectionIndex + 1 < sectionStarts.length ? sectionStarts[sectionIndex + 1] : lines.length;
    const sectionLines = lines.slice(start, end);
    const sectionLength = sectionLines.reduce((sum, line) => sum + line.length + 1, 0);

    if (currentLength > 0 && currentLength + sectionLength > CHUNK_TARGET_SIZE) {
      chunks.push(currentLines.join("\n"));
      currentLines = [];
      currentLength = 0;
    }

    currentLines.push(...sectionLines);
    currentLength += sectionLength;
  }

  if (currentLines.length > 0) {
    chunks.push(currentLines.join("\n"));
  }

  if (chunks.length <= 1 && normalized.length > CHUNK_CHAR_THRESHOLD) {
    const fallbackChunks: string[] = [];
    let cursor = 0;

    while (cursor < normalized.length) {
      let end = Math.min(cursor + CHUNK_TARGET_SIZE, normalized.length);
      if (end < normalized.length) {
        const paragraphBreak = normalized.lastIndexOf("\n\n", end);
        if (paragraphBreak > cursor + CHUNK_TARGET_SIZE * 0.5) {
          end = paragraphBreak;
        }
      }

      fallbackChunks.push(normalized.slice(cursor, end));
      cursor = end;
    }

    return fallbackChunks;
  }

  return chunks;
}

export function buildChunkPrompt({
  chunkText,
  chunkIndex,
  totalChunks,
  languageProfile,
  sectionHeadingHints,
}: {
  chunkText: string;
  chunkIndex: number;
  totalChunks: number;
  languageProfile: LanguageProfile;
  sectionHeadingHints: string[];
}) {
  const languageInstruction =
    languageProfile.code === "unknown"
      ? "Detect the dominant language of the source material and write every user-facing field in that same language."
      : `Write every user-facing field in ${languageProfile.name} (${languageProfile.code}). Do not translate it into English.`;

  const chunkNorm = chunkText.toLocaleLowerCase().replace(/[\s\-—–:.,;!?·]+/gu, "");
  const chunkHeadings = (sectionHeadingHints || []).filter((hint) => {
    const hintNorm = hint.toLocaleLowerCase().replace(/[\s\-—–:.,;!?·]+/gu, "");
    return chunkNorm.includes(hintNorm);
  });

  const structureHints =
    chunkHeadings.length > 0
      ? [
          "This chunk contains these sections - you MUST create at least one idea per section. Never merge two sections into one idea:",
          ...chunkHeadings.map((hint) => `- ${hint}`),
        ]
      : ["Create learner-friendly idea boundaries based on the content."];

  return [
    `You are generating ideas for chunk ${chunkIndex + 1} of ${totalChunks} of a learning pack.`,
    "Generate ONLY the ideas array for this chunk of source material. Do NOT generate pack metadata.",
    "Return valid JSON only. Do not include markdown fences or any prose outside JSON.",
    "This is NOT summarization. Transform every piece of information in this chunk into learning ideas. Nothing is cut.",
    "The audience is a curious middle-school student encountering this topic for the first time.",
    "Explain every concept as if you are a friendly tutor: use everyday analogies, step-by-step reasoning, and concrete examples before formal definitions.",
    "However, do NOT lower the conceptual density. Every formula, theorem, definition, and technical detail must still appear.",
    languageInstruction,
    ...structureHints,
    "Requirements:",
    "- Generate as many ideas as this chunk needs. Cover every major topic, concept, and technique.",
    "- Idea titles must NOT include chapter/part/section numbering or labels (e.g. '1장', 'Chapter 3', 'Part 1', '제2부'). Write only the descriptive title.",
    "- Idea titles should stay close to the original source headings. Keep them concise but recognizable - up to about 8 words.",
    "- Each idea MUST have at least 5 lesson cards. If the source material for an idea is rich or detailed, use 8-18 or more.",
    "- One card = one concept, one step, or one point. If a card covers two distinct points, split it into two cards.",
    "- Card body: 4 to 8 sentences per card.",
    "- Card body should open with plain-language intuition, then build up to the formal concept.",
    "- FORMATTING: Use limited markdown in body and support fields:",
    "  - Wrap key terms and concepts in **double asterisks** for bold.",
    "  - Use *single asterisks* for emphasis or contrast.",
    "  - Separate paragraphs with \\n\\n (2-3 sentence paragraphs).",
    "  - Do NOT use $$..$$, $..$ or any LaTeX/KaTeX delimiters.",
    "  - Do NOT use any other markdown: no #headings, no - bullet lists, no [links], no `code`.",
    "- Cover ALL content in this chunk. Do not skip concepts.",
    "- It is far worse to omit a topic than to produce more ideas. Completeness over brevity.",
    "- Each idea MUST include a `section` field: a short group label (max 60 chars) reflecting the source's chapter/part/section structure.",
    "- Practice must include exactly 5 questions per idea.",
    "- Each question should have exactly 3 options with one correct answer.",
    "",
    "Source material chunk:",
    chunkText,
  ].join("\n");
}

export function buildMetaPrompt({
  title,
  author,
  category,
  ideaTitles,
  languageProfile,
}: {
  title?: string;
  author?: string;
  category?: string;
  ideaTitles: string[];
  languageProfile: LanguageProfile;
}) {
  const languageInstruction =
    languageProfile.code === "unknown"
      ? "Detect the dominant language and write every field in that language."
      : `Write every field in ${languageProfile.name} (${languageProfile.code}).`;

  const requestedHints = [
    title ? `Requested title hint: ${title}` : null,
    author ? `Requested author hint: ${author}` : null,
    category ? `Requested category hint: ${category}` : null,
  ].filter(Boolean);

  return [
    "Generate ONLY the pack metadata and final pack review for a learning pack.",
    "Return valid JSON only. Do not include markdown fences or any prose outside JSON.",
    "The ideas have already been generated. Here are the idea titles for context:",
    ...ideaTitles.map((ideaTitle, index) => `${index + 1}. ${ideaTitle}`),
    "",
    languageInstruction,
    "Requirements:",
    "- Pack title: concise and recognizable. Use the source's own title or a natural short version of it. Do not invent a new creative title.",
    "- Add a final pack review with 10 questions (or more if there are many ideas) that test across multiple ideas.",
    "- Final pack review questions should check synthesis, comparison, or scenario-based reasoning.",
    "- Each review question must have exactly 3 options with one correct answer.",
    "",
    ...requestedHints,
  ].join("\n");
}

export function buildShortIdeaOutlinePrompt({
  chunkText,
  chunkIndex,
  totalChunks,
  languageProfile,
  sectionHeadingHints,
}: {
  chunkText: string;
  chunkIndex: number;
  totalChunks: number;
  languageProfile: LanguageProfile;
  sectionHeadingHints: string[];
}) {
  const languageInstruction =
    languageProfile.code === "unknown"
      ? "Detect the dominant language of the source material and write every user-facing field in that same language."
      : `Write every user-facing field in ${languageProfile.name} (${languageProfile.code}). Do not translate it into English.`;

  return [
    `You are extracting short-lesson ideas for chunk ${chunkIndex + 1} of ${totalChunks}.`,
    "Generate ONLY the ideas array for this chunk of source material.",
    "Return valid JSON only. Do not include markdown fences or any prose outside JSON.",
    "This is not a summary. Create idea boundaries that can each become a small sequence of concept-led short clips.",
    languageInstruction,
    "Requirements:",
    "- Create as many ideas as needed to cover every distinct section, concept group, or worked method in this chunk.",
    "- Idea titles must stay close to the source headings, but remove chapter numbering.",
    "- Each idea MUST have a `section`, `title`, `teaser`, and `durationSec`.",
    "- `durationSec` is the estimated total runtime for that idea across all of its clips.",
    "- `durationSec` must be an integer between 45 and 300.",
    "- If explicit headings exist in the chunk, create at least one idea per heading.",
    ...(sectionHeadingHints.length > 0
      ? [
          "Relevant source section hints:",
          ...sectionHeadingHints.map((hint) => `- ${hint}`),
        ]
      : []),
    "",
    "Source material chunk:",
    chunkText,
  ].join("\n");
}

export function buildShortIdeaStoryboardPrompt({
  outline,
  chunkText,
  languageProfile,
  retryReason,
}: {
  outline: any;
  chunkText: string;
  languageProfile: LanguageProfile;
  retryReason?: string;
}) {
  const languageInstruction =
    languageProfile.code === "unknown"
      ? "Detect the dominant language of the source material and write every user-facing field in that same language."
      : `Write every user-facing field in ${languageProfile.name} (${languageProfile.code}).`;

  return [
    "Generate ONE short-form lecture idea as structured JSON.",
    "Return valid JSON only. Do not include markdown fences or any prose outside JSON.",
    "The output should feel like a short vertical lesson designed for TikTok/Reels-style consumption, not an audio-only podcast.",
    languageInstruction,
    retryReason ? `Correction from the previous attempt: ${retryReason}` : null,
    "Requirements:",
    "- Keep the idea focused on the requested outline only. Do not bleed in unrelated material from the same chunk.",
    "- Do NOT turn the whole idea into one long short.",
    "- Split the idea into concept-based `clips`, like cards in the card format. Each clip should teach one clean concept, distinction, worked step, or example.",
    "- Use concept boundaries, not arbitrary time slicing.",
    "- Create 1-5 clips depending on the idea. Usually 2-4 clips is best unless the idea is truly atomic.",
    "- The overall idea should usually land around 45-300 seconds total across all clips.",
    "- Each clip should usually land around 25-90 seconds. Do not force clips under 30 seconds if the concept needs more space.",
    "- The `clips` array items must include: title, teaser, durationSec, hook, learningGoal, targetPlatform, videoStyle, captionStyle, musicCue, coverSceneId, narrationScript, scenes.",
    "- Every clip should feel self-contained, but the sequence of clips should still build naturally across the idea.",
    "- Every scene must include: headline, body, narration, callouts, captionLines, emphasisWords, visualStyle, layoutHint, motionHint, transitionHint, estimatedSec.",
    "- Scene body is on-screen copy for a PPT-like slide. Keep it concise and readable on mobile.",
    "- `captionLines` are the punchy on-screen caption overlay. Use 1-2 short lines per scene.",
    "- `emphasisWords` should contain up to 4 important keywords worth highlighting visually.",
    "- Scene narration is what the TTS voice reads. It should be more explanatory than the on-screen body.",
    "- `motionHint` should describe how the shot should feel or move in a vertical short.",
    "- `transitionHint` should describe how the scene should connect into the next beat.",
    "- `coverSceneId` should identify the most visually gripping scene within that clip. Use a simple order-based id like `scene-1`, `scene-2`, or `scene-3`.",
    "- Each clip's `narrationScript` must read like a complete mini-lesson and align with that clip's scene narrations.",
    "- `quiz.questions` must contain exactly 3 questions with exactly 3 options each.",
    "- Prefer plain-language explanation first, then the formal concept.",
    "- Do not omit formulas, definitions, or critical distinctions that belong to this idea.",
    "",
    `Requested idea section: ${outline?.section || ""}`,
    `Requested idea title: ${outline?.title || ""}`,
    `Requested idea teaser: ${outline?.teaser || ""}`,
    `Target durationSec: ${normalizeIdeaDurationSec(outline?.durationSec)}`,
    "",
    "Relevant source chunk:",
    chunkText,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildShortMetaPrompt({
  title,
  author,
  category,
  ideaTitles,
  languageProfile,
}: {
  title?: string;
  author?: string;
  category?: string;
  ideaTitles: string[];
  languageProfile: LanguageProfile;
}) {
  const languageInstruction =
    languageProfile.code === "unknown"
      ? "Detect the dominant language and write every field in that language."
      : `Write every field in ${languageProfile.name} (${languageProfile.code}).`;

  const requestedHints = [
    title ? `Requested title hint: ${title}` : null,
    author ? `Requested author hint: ${author}` : null,
    category ? `Requested category hint: ${category}` : null,
  ].filter(Boolean);

  return [
    "Generate ONLY the pack metadata for a short-lecture learning pack.",
    "Return valid JSON only. Do not include markdown fences or any prose outside JSON.",
    "The ideas have already been generated. Here are the idea titles for context:",
    ...ideaTitles.map((ideaTitle, index) => `${index + 1}. ${ideaTitle}`),
    "",
    languageInstruction,
    "Requirements:",
    "- Pack title: concise and recognizable. Use the source title or a natural short version.",
    "- Subtitle and description should promise short, scrollable concept clips rather than one long short or flashcards.",
    "- `minutesPerIdea` should communicate that each idea unfolds through multiple short clips.",
    "- Do not include packReview.",
    "",
    ...requestedHints,
  ].join("\n");
}

export function buildPrompt({
  title,
  author,
  category,
  sourceText,
  languageProfile,
  retryForLanguage,
  sectionHeadingHints,
  retryForIdeaCount,
  isMultimodal,
}: {
  title?: string;
  author?: string;
  category?: string;
  sourceText: string;
  languageProfile: LanguageProfile;
  retryForLanguage?: boolean;
  sectionHeadingHints: string[];
  retryForIdeaCount?: { expectedMinIdeas: number; actualIdeas: number; missingHints: string[] };
  isMultimodal?: boolean;
}) {
  const languageInstruction =
    languageProfile.code === "unknown"
      ? "Detect the dominant language of the source material and write every user-facing field in that same language. If the source is Korean, output Korean. If it is English, output English. If it is Danish, output Danish. Do not default to English unless the source is clearly English."
      : `The detected dominant source language is ${languageProfile.name} (${languageProfile.code}). Write every user-facing field in ${languageProfile.name}. Do not translate it into English.`;

  const retryInstruction =
    retryForLanguage && languageProfile.code !== "unknown"
      ? `Important correction: a previous attempt drifted into English. Rewrite everything in ${languageProfile.name} only.`
      : null;

  const ideaCountRetryInstruction = retryForIdeaCount
    ? [
        `CRITICAL CORRECTION: A previous attempt produced only ${retryForIdeaCount.actualIdeas} ideas, but the source has ${retryForIdeaCount.expectedMinIdeas} distinct sections. This is wrong.`,
        `You MUST produce at least ${retryForIdeaCount.expectedMinIdeas} ideas - one per source section. Do NOT merge sections.`,
        ...(retryForIdeaCount.missingHints.length > 0
          ? [
              "The following source sections were missing or merged in the previous attempt. Each MUST get its own dedicated idea:",
              ...retryForIdeaCount.missingHints.map((hint) => `- ${hint}`),
            ]
          : []),
      ]
    : [];

  const requestedHints = [
    title ? `Requested title hint: ${title}` : null,
    author ? `Requested author hint: ${author}` : null,
    category ? `Requested category hint: ${category}` : null,
  ].filter(Boolean);

  const multimodalStructureHints = isMultimodal
    ? [
        "CRITICAL - DOCUMENT SCANNING STEP: Before generating any ideas, you MUST first read the ENTIRE attached document from beginning to end.",
        "Count the total number of chapters/sections you find. You MUST produce AT LEAST one idea for EACH chapter or section.",
        "Do NOT stop after the first few sections. Continue reading through EVERY page of the document until you reach the very end.",
      ]
    : [];

  const structureHints =
    Array.isArray(sectionHeadingHints) && sectionHeadingHints.length > 0
      ? [
          "The source appears to contain explicit sections or subheadings. Use them as the first-choice structure instead of inventing a new outline from scratch.",
          "Preserve the original source order.",
          `The source has at least ${sectionHeadingHints.length} distinct sections. You MUST produce at least ${sectionHeadingHints.length} ideas.`,
          "Detected source section hints:",
          ...sectionHeadingHints.map((hint) => `- ${hint}`),
        ]
      : [
          "If the source has clear sections or subheadings, preserve them as the default idea boundaries.",
          "If the source does not present reliable headings, create learner-friendly idea boundaries yourself.",
        ];

  return [
    "Reshape the source into a mobile-first learning pack. This is NOT summarization.",
    "Return valid JSON only. Do not include markdown fences or any prose outside JSON.",
    "Every piece of information in the source must appear in the pack. Nothing is cut.",
    "The audience is a curious middle-school student encountering this topic for the first time.",
    "Explain every concept as if you are a friendly tutor talking to that student.",
    "Do NOT lower the conceptual density. Every formula, theorem, definition, and technical detail in the source must still appear.",
    languageInstruction,
    "Use the same language consistently for all user-facing fields.",
    retryInstruction,
    ...ideaCountRetryInstruction,
    ...multimodalStructureHints,
    ...structureHints,
    "Requirements:",
    "- Pack title: concise and recognizable. Use the source's own title or a natural short version of it.",
    "- Generate as many key ideas as the source genuinely needs.",
    "- If clear source headings are present, generate AT LEAST one idea per heading.",
    "- Idea titles must NOT include chapter/part/section numbering or labels.",
    "- Each idea MUST have at least 5 lesson cards.",
    "- If an idea is dense, use 8-18 or more lesson cards rather than compressing multiple concepts into one card.",
    "- More cards that each teach one small point clearly is ALWAYS better than fewer cards that compress multiple points.",
    "- One card = one concept, one step, or one point. If a card covers two distinct points, split it into two cards.",
    "- Card title: short phrase, at most 5 words.",
    "- Card body: 4 to 8 sentences per card.",
    "- Card support: 1 to 4 short sentences with a helpful example, analogy, implication, contrast, common mistake, or mini-case.",
    "- Reflection prompt: one short, mobile-friendly prompt. Do not ask them to write, list, note, type, journal, or speak out loud.",
    "- Practice must include exactly 5 questions.",
    "- Add a final pack review with 10 questions (or more if the pack has many ideas).",
    "- It is far worse to omit a concept than to produce a longer pack. Completeness over brevity.",
    "",
    ...requestedHints,
    "",
    "Source material:",
    sourceText,
  ].join("\n");
}

function buildDebugPayload({
  sourceText,
  sectionHeadingHints,
  chunks,
  isMultimodal,
}: {
  sourceText: string;
  sectionHeadingHints: string[];
  chunks: string[];
  isMultimodal: boolean;
}) {
  return {
    sourceLength: sourceText.length,
    sourceStart: sourceText.slice(0, 500),
    headings: sectionHeadingHints,
    chunks: chunks.map((chunk, index) => ({ index, length: chunk.length, start: chunk.slice(0, 150) })),
    multimodal: isMultimodal,
  };
}

function matchesIdeaHeading(idea: any, hint: string) {
  const titleLower = (idea.title || "").toLowerCase();
  const hintLower = hint.toLowerCase().replace(/^\d+[\.):\-]?\s*/, "");
  return (
    titleLower.includes(hintLower) ||
    hintLower.includes(titleLower) ||
    titleLower.split(/\s+/).filter((word: string) => hintLower.includes(word)).length >=
      Math.max(1, Math.floor(hintLower.split(/\s+/).length * 0.5))
  );
}

async function generateShortsPackFromSource({
  title,
  author,
  category,
  sourceText,
  geminiFileBuffer,
  geminiFileMimeType,
  generateLLM,
  onProgress,
}: {
  title?: string;
  author?: string;
  category?: string;
  sourceText: string;
  geminiFileBuffer?: unknown;
  geminiFileMimeType?: string | null;
  generateLLM: GenerateLLM;
  onProgress?: (patch: ProgressPatch) => void | Promise<void>;
}) {
  const isMultimodal = Boolean(geminiFileBuffer);
  const languageProfile = isMultimodal ? UNKNOWN_LANGUAGE_PROFILE : detectSourceLanguage(sourceText);
  const sectionHeadingHints = isMultimodal ? [] : extractSectionHeadingHints(sourceText, languageProfile);
  const chunks = isMultimodal ? [sourceText] : splitSourceIntoChunks(sourceText);
  const debug = buildDebugPayload({ sourceText, sectionHeadingHints, chunks, isMultimodal });

  await onProgress?.({ debug });
  await onProgress?.({ step: "outlining", totalChunks: chunks.length, completedChunks: 0 });

  const outlineRecords: Array<any & { __chunkText: string }> = [];

  for (let index = 0; index < chunks.length; index += 1) {
    const result = await generateLLM({
      max_output_tokens: 16384,
      input: buildShortIdeaOutlinePrompt({
        chunkText: chunks[index],
        chunkIndex: index,
        totalChunks: chunks.length,
        languageProfile,
        sectionHeadingHints,
      }),
      jsonSchema: { name: "short_idea_outlines", schema: shortIdeaOutlineSchema },
      fileBuffer: isMultimodal && index === 0 ? geminiFileBuffer : undefined,
      fileMimeType: isMultimodal && index === 0 ? geminiFileMimeType : undefined,
    });

    if (!result.output_text) {
      throw new Error("LLM did not return structured text output for short idea outlines.");
    }

    const parsed = JSON.parse(result.output_text);
    for (const outline of parsed?.ideas || []) {
      outlineRecords.push({
        ...outline,
        __chunkText: chunks[index],
      });
    }
    await onProgress?.({ completedChunks: index + 1 });
  }

  if (outlineRecords.length === 0) {
    throw new Error("No short lecture ideas were generated from the source.");
  }

  await onProgress?.({ step: "storyboarding", totalChunks: outlineRecords.length, completedChunks: 0 });

  const rawIdeas: any[] = [];

  for (let index = 0; index < outlineRecords.length; index += 1) {
    const outline = outlineRecords[index];
    let generation = await generateLLM({
      max_output_tokens: 16384,
      input: buildShortIdeaStoryboardPrompt({
        outline,
        chunkText: outline.__chunkText,
        languageProfile,
      }),
      jsonSchema: { name: "short_idea_storyboard", schema: shortIdeaStoryboardSchema },
    });

    if (!generation.output_text) {
      throw new Error("LLM did not return structured text output for a short storyboard.");
    }

    let rawIdea = JSON.parse(generation.output_text);

    if (!isShortIdeaValid(rawIdea)) {
      generation = await generateLLM({
        max_output_tokens: 16384,
        input: buildShortIdeaStoryboardPrompt({
          outline,
          chunkText: outline.__chunkText,
          languageProfile,
          retryReason:
            "The previous response was incomplete. Make sure the idea is split into concept-based clips, each clip has a valid duration and scenes, and the quiz has exactly 3 questions.",
        }),
        jsonSchema: { name: "short_idea_storyboard", schema: shortIdeaStoryboardSchema },
      });

      if (generation.output_text) {
        const retryIdea = JSON.parse(generation.output_text);
        if (isShortIdeaValid(retryIdea)) {
          rawIdea = retryIdea;
        }
      }
    }

    rawIdeas.push({
      section: rawIdea?.section || outline.section,
      title: rawIdea?.title || outline.title,
      teaser: rawIdea?.teaser || outline.teaser,
      durationSec: rawIdea?.durationSec || outline.durationSec,
      clips: getRawShortClipSources(rawIdea),
      quiz: rawIdea?.quiz || { questions: [] },
    });
    await onProgress?.({ completedChunks: index + 1 });
  }

  await onProgress?.({ step: "finalizing" });
  const metaGeneration = await generateLLM({
    max_output_tokens: 8192,
    input: buildShortMetaPrompt({
      title,
      author,
      category,
      ideaTitles: rawIdeas.map((idea) => idea.title || ""),
      languageProfile,
    }),
    jsonSchema: { name: "shorts_pack_meta", schema: shortsPackMetaSchema },
  });

  if (!metaGeneration.output_text) {
    throw new Error("LLM did not return structured text output for short pack metadata.");
  }

  const meta = JSON.parse(metaGeneration.output_text);
  const pack = normalizePack(
    { ...meta, format: "shorts", ideas: rawIdeas },
    { title, author, category },
    languageProfile,
    "shorts"
  );

  return {
    debug,
    languageProfile,
    pack,
    sectionHeadingHints,
  };
}

export async function generatePackFromSource({
  title,
  author,
  category,
  packFormat = "shorts",
  sourceText,
  geminiFileBuffer,
  geminiFileMimeType,
  llmProvider,
  generateLLM,
  onProgress,
}: {
  title?: string;
  author?: string;
  category?: string;
  packFormat?: PackFormat;
  sourceText: string;
  geminiFileBuffer?: unknown;
  geminiFileMimeType?: string | null;
  llmProvider: string;
  generateLLM: GenerateLLM;
  onProgress?: (patch: ProgressPatch) => void | Promise<void>;
}) {
  if (packFormat === "shorts") {
    return generateShortsPackFromSource({
      title,
      author,
      category,
      sourceText,
      geminiFileBuffer,
      geminiFileMimeType,
      generateLLM,
      onProgress,
    });
  }

  const isMultimodal = Boolean(geminiFileBuffer);
  const languageProfile = isMultimodal ? UNKNOWN_LANGUAGE_PROFILE : detectSourceLanguage(sourceText);
  const sectionHeadingHints = isMultimodal ? [] : extractSectionHeadingHints(sourceText, languageProfile);
  const skipChunking = isMultimodal;
  const chunks = skipChunking ? [sourceText] : splitSourceIntoChunks(sourceText);
  const debug = buildDebugPayload({ sourceText, sectionHeadingHints, chunks, isMultimodal });

  await onProgress?.({ debug });

  let parsed: any;

  if (chunks.length <= 1) {
    await onProgress?.({ step: "generating", totalChunks: 1, completedChunks: 0 });

    const promptSourceText = isMultimodal
      ? "The source material is the attached file. Read the entire document carefully - every page, every section, every paragraph. Do not skip any content."
      : sourceText;

    let generation = await generateLLM({
      max_output_tokens: 65536,
      input: buildPrompt({
        title,
        author,
        category,
        sourceText: promptSourceText,
        languageProfile,
        sectionHeadingHints,
        isMultimodal,
      }),
      jsonSchema: { name: "learning_pack", schema: packSchema },
      fileBuffer: geminiFileBuffer,
      fileMimeType: geminiFileMimeType,
    });

    if (!generation.output_text) {
      throw new Error("LLM did not return structured text output.");
    }

    parsed = JSON.parse(generation.output_text);
    await onProgress?.({ completedChunks: 1 });

    if (shouldRetryForLanguageMismatch(languageProfile, parsed)) {
      await onProgress?.({ step: "retrying" });
      generation = await generateLLM({
        max_output_tokens: 65536,
        input: buildPrompt({
          title,
          author,
          category,
          sourceText: promptSourceText,
          languageProfile,
          retryForLanguage: true,
          sectionHeadingHints,
          isMultimodal,
        }),
        jsonSchema: { name: "learning_pack", schema: packSchema },
        fileBuffer: geminiFileBuffer,
        fileMimeType: geminiFileMimeType,
      });

      if (!generation.output_text) {
        throw new Error("LLM did not return structured text output on retry.");
      }

      parsed = JSON.parse(generation.output_text);
    }

    const expectedMinIdeas = sectionHeadingHints.length;
    const currentIdeas = Array.isArray(parsed?.ideas) ? parsed.ideas : [];
    const actualIdeas = currentIdeas.length;

    if (expectedMinIdeas > 0 && actualIdeas < expectedMinIdeas) {
      await onProgress?.({ step: "retrying" });
      const missingHints = sectionHeadingHints.filter(
        (hint) => !currentIdeas.some((idea: any) => matchesIdeaHeading(idea, hint))
      );

      generation = await generateLLM({
        max_output_tokens: 65536,
        input: buildPrompt({
          title,
          author,
          category,
          sourceText: promptSourceText,
          languageProfile,
          sectionHeadingHints,
          retryForIdeaCount: { expectedMinIdeas, actualIdeas, missingHints },
          isMultimodal,
        }),
        jsonSchema: { name: "learning_pack", schema: packSchema },
        fileBuffer: geminiFileBuffer,
        fileMimeType: geminiFileMimeType,
      });

      if (generation.output_text) {
        const retryParsed = JSON.parse(generation.output_text);
        const retryCount = Array.isArray(retryParsed?.ideas) ? retryParsed.ideas.length : 0;
        if (retryCount >= actualIdeas) {
          parsed = retryParsed;
        }
      }
    }
  } else {
    await onProgress?.({ step: "generating", totalChunks: chunks.length, completedChunks: 0 });

    const allIdeas: any[] = [];
    for (let index = 0; index < chunks.length; index += 1) {
      const result = await generateLLM({
        max_output_tokens: 65536,
        input: buildChunkPrompt({
          chunkText: chunks[index],
          chunkIndex: index,
          totalChunks: chunks.length,
          languageProfile,
          sectionHeadingHints,
        }),
        jsonSchema: { name: "chunk_ideas", schema: chunkIdeasSchema },
      });

      if (!result.output_text) {
        throw new Error("LLM did not return structured text output for a chunk.");
      }

      const chunkParsed = JSON.parse(result.output_text);
      allIdeas.push(...(chunkParsed.ideas || []));
      await onProgress?.({ completedChunks: index + 1 });
    }

    await onProgress?.({ step: "finalizing" });
    const metaGeneration = await generateLLM({
      max_output_tokens: 16384,
      input: buildMetaPrompt({
        title,
        author,
        category,
        ideaTitles: allIdeas.map((idea) => idea.title || ""),
        languageProfile,
      }),
      jsonSchema: { name: "pack_meta", schema: packMetaSchema },
    });

    if (!metaGeneration.output_text) {
      throw new Error("LLM did not return structured text output for pack metadata.");
    }

    const meta = JSON.parse(metaGeneration.output_text);
    parsed = { ...meta, ideas: allIdeas };
  }

  const pack = normalizePack(parsed, { title, author, category }, languageProfile);
  return {
    debug,
    languageProfile,
    pack,
    sectionHeadingHints,
  };
}
