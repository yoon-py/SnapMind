import {
  IDEA_CHAT_LIMITS,
  IDEA_CHAT_MAX_MESSAGES,
  IDEA_CHAT_MAX_MESSAGE_LENGTH,
  type LanguageProfile,
  UNKNOWN_LANGUAGE_PROFILE,
} from "./constants";
import { clampText, trimText } from "./text";

export function normalizeIdeaContext(rawIdeaContext: any) {
  const packFormat = trimText(rawIdeaContext?.packFormat, "cards") === "shorts" ? "shorts" : "cards";
  const lessonCards = Array.isArray(rawIdeaContext?.lessonCards)
    ? rawIdeaContext.lessonCards
        .map((card: any) => ({
          eyebrow: clampText(trimText(card?.eyebrow, ""), IDEA_CHAT_LIMITS.lessonEyebrow),
          title: clampText(trimText(card?.title, ""), IDEA_CHAT_LIMITS.lessonTitle),
          body: clampText(trimText(card?.body, ""), IDEA_CHAT_LIMITS.lessonBody),
          support: clampText(trimText(card?.support, ""), IDEA_CHAT_LIMITS.lessonSupport),
        }))
        .filter((card: any) => card.eyebrow || card.title || card.body || card.support)
        .slice(0, 8)
    : [];

  const shortScenes = Array.isArray(rawIdeaContext?.shortScenes)
    ? rawIdeaContext.shortScenes
        .map((scene: any) => ({
          headline: clampText(trimText(scene?.headline, ""), IDEA_CHAT_LIMITS.sceneHeadline),
          body: clampText(trimText(scene?.body, ""), IDEA_CHAT_LIMITS.sceneBody),
          narration: clampText(trimText(scene?.narration, ""), IDEA_CHAT_LIMITS.shortNarrationScript),
          callouts: Array.isArray(scene?.callouts)
            ? scene.callouts
                .map((callout: any) => clampText(trimText(callout, ""), IDEA_CHAT_LIMITS.sceneCallout))
                .filter(Boolean)
                .slice(0, 4)
            : [],
          captionLines: Array.isArray(scene?.captionLines)
            ? scene.captionLines
                .map((line: any) => clampText(trimText(line, ""), IDEA_CHAT_LIMITS.sceneCaptionLine))
                .filter(Boolean)
                .slice(0, 3)
            : [],
          emphasisWords: Array.isArray(scene?.emphasisWords)
            ? scene.emphasisWords
                .map((word: any) => clampText(trimText(word, ""), IDEA_CHAT_LIMITS.sceneEmphasisWord))
                .filter(Boolean)
                .slice(0, 4)
            : [],
          motionHint: clampText(trimText(scene?.motionHint, ""), IDEA_CHAT_LIMITS.sceneMotionHint),
          transitionHint: clampText(trimText(scene?.transitionHint, ""), IDEA_CHAT_LIMITS.sceneTransitionHint),
        }))
        .filter(
          (scene: any) =>
            scene.headline ||
            scene.body ||
            scene.narration ||
            scene.callouts.length > 0 ||
            scene.captionLines.length > 0 ||
            scene.emphasisWords.length > 0
        )
        .slice(0, 7)
    : [];

  const summaryBullets = Array.isArray(rawIdeaContext?.summaryBullets)
    ? rawIdeaContext.summaryBullets
        .map((bullet: any) => clampText(trimText(bullet, ""), IDEA_CHAT_LIMITS.summaryBullet))
        .filter(Boolean)
        .slice(0, 4)
    : [];

  const practiceQuestions = Array.isArray(rawIdeaContext?.practiceQuestions)
    ? rawIdeaContext.practiceQuestions
        .map((question: any) => ({
          question: clampText(trimText(question?.question, ""), IDEA_CHAT_LIMITS.practiceQuestion),
          options: Array.isArray(question?.options)
            ? question.options
                .map((option: any) => clampText(trimText(option, ""), IDEA_CHAT_LIMITS.practiceOption))
                .filter(Boolean)
                .slice(0, 3)
            : [],
          explanation: clampText(
            trimText(question?.explanation, ""),
            IDEA_CHAT_LIMITS.practiceExplanation
          ),
        }))
        .filter((question: any) => question.question || question.options.length > 0 || question.explanation)
        .slice(0, 3)
    : [];

  return {
    packFormat,
    packTitle: clampText(trimText(rawIdeaContext?.packTitle, ""), IDEA_CHAT_LIMITS.packTitle),
    ideaTitle: clampText(trimText(rawIdeaContext?.ideaTitle, ""), IDEA_CHAT_LIMITS.ideaTitle),
    lessonCards,
    hook: clampText(trimText(rawIdeaContext?.hook, ""), IDEA_CHAT_LIMITS.shortHook),
    learningGoal: clampText(trimText(rawIdeaContext?.learningGoal, ""), IDEA_CHAT_LIMITS.shortLearningGoal),
    targetPlatform: clampText(trimText(rawIdeaContext?.targetPlatform, ""), IDEA_CHAT_LIMITS.shortTargetPlatform),
    videoStyle: clampText(trimText(rawIdeaContext?.videoStyle, ""), IDEA_CHAT_LIMITS.shortVideoStyle),
    captionStyle: clampText(trimText(rawIdeaContext?.captionStyle, ""), IDEA_CHAT_LIMITS.shortCaptionStyle),
    musicCue: clampText(trimText(rawIdeaContext?.musicCue, ""), IDEA_CHAT_LIMITS.shortMusicCue),
    narrationScript: clampText(
      trimText(rawIdeaContext?.narrationScript, ""),
      IDEA_CHAT_LIMITS.shortNarrationScript
    ),
    shortScenes,
    summaryBullets,
    reflectionPrompt: clampText(
      trimText(rawIdeaContext?.reflectionPrompt, ""),
      IDEA_CHAT_LIMITS.reflectionPrompt
    ),
    practiceQuestions,
  };
}

export function hasIdeaContext(ideaContext: any) {
  return Boolean(
    ideaContext.ideaTitle ||
      ideaContext.packTitle ||
      ideaContext.lessonCards.length > 0 ||
      ideaContext.shortScenes.length > 0 ||
      ideaContext.hook ||
      ideaContext.learningGoal ||
      ideaContext.targetPlatform ||
      ideaContext.videoStyle ||
      ideaContext.captionStyle ||
      ideaContext.musicCue ||
      ideaContext.narrationScript ||
      ideaContext.summaryBullets.length > 0 ||
      ideaContext.reflectionPrompt ||
      ideaContext.practiceQuestions.length > 0
  );
}

export function normalizeIdeaChatMessages(rawMessages: any[]) {
  if (!Array.isArray(rawMessages)) {
    return [];
  }

  return rawMessages
    .map((message: any) => ({
      role: message?.role === "assistant" ? "assistant" : message?.role === "user" ? "user" : null,
      content: clampText(trimText(message?.content, ""), IDEA_CHAT_MAX_MESSAGE_LENGTH),
    }))
    .filter((message: any) => message.role && message.content)
    .slice(-IDEA_CHAT_MAX_MESSAGES);
}

export function collectIdeaContextText(ideaContext: any) {
  const parts = [
    ideaContext.packFormat,
    ideaContext.packTitle,
    ideaContext.ideaTitle,
    ideaContext.hook,
    ideaContext.learningGoal,
    ideaContext.targetPlatform,
    ideaContext.videoStyle,
    ideaContext.captionStyle,
    ideaContext.musicCue,
    ideaContext.narrationScript,
    ideaContext.reflectionPrompt,
    ...ideaContext.summaryBullets,
  ];

  for (const card of ideaContext.lessonCards) {
    parts.push(card.eyebrow, card.title, card.body, card.support);
  }

  for (const question of ideaContext.practiceQuestions) {
    parts.push(question.question, question.explanation);
    parts.push(...question.options);
  }

  for (const scene of ideaContext.shortScenes) {
    parts.push(scene.headline, scene.body, scene.narration);
    parts.push(...scene.callouts);
    parts.push(...scene.captionLines);
    parts.push(...scene.emphasisWords);
    parts.push(scene.motionHint, scene.transitionHint);
  }

  return parts.filter(Boolean).join(" ");
}

export function buildIdeaChatPrompt({
  ideaContext,
  messages,
  languageProfile = UNKNOWN_LANGUAGE_PROFILE,
}: {
  ideaContext: any;
  messages: any[];
  languageProfile?: LanguageProfile;
}) {
  const languageInstruction =
    languageProfile.code === "unknown"
      ? "Reply in the same language as the learning content."
      : `Reply only in ${languageProfile.name}.`;

  const lessonCardLines = ideaContext.lessonCards.length
    ? ideaContext.lessonCards
        .map(
          (card: any, index: number) =>
            `Card ${index + 1}: ${[card.eyebrow, card.title, card.body, card.support]
              .filter(Boolean)
              .join(" | ")}`
        )
        .join("\n")
    : "No lesson cards provided.";

  const shortSceneLines = ideaContext.shortScenes.length
    ? ideaContext.shortScenes
        .map(
          (scene: any, index: number) =>
            `Scene ${index + 1}: ${[
              scene.headline,
              scene.body,
              scene.narration,
              ...(scene.callouts || []),
              ...(scene.captionLines || []),
              ...(scene.emphasisWords || []),
              scene.motionHint,
              scene.transitionHint,
            ]
              .filter(Boolean)
              .join(" | ")}`
        )
        .join("\n")
    : "No short scenes provided.";

  const summaryLines = ideaContext.summaryBullets.length
    ? ideaContext.summaryBullets.map((bullet: string, index: number) => `${index + 1}. ${bullet}`).join("\n")
    : "No summary bullets provided.";

  const practiceLines = ideaContext.practiceQuestions.length
    ? ideaContext.practiceQuestions
        .map(
          (question: any, index: number) =>
            `Question ${index + 1}: ${question.question}\nOptions: ${
              question.options.join(" | ") || "No options"
            }\nExplanation: ${question.explanation || "No explanation"}`
        )
        .join("\n\n")
    : "No practice questions provided.";

  const conversationLines = messages.length
    ? messages
        .map((message: any) => `${message.role === "user" ? "Learner" : "Tutor"}: ${message.content}`)
        .join("\n")
    : "Learner: ";

  return [
    "You are an in-app tutor helping a learner understand one idea from a study pack.",
    languageInstruction,
    "Stay centered on the idea context and conversation below.",
    "Answer clearly, concretely, and briefly.",
    "Start with the simplest helpful explanation you can give.",
    "If the learner asks about a term mentioned in the idea, explain it in plain language first.",
    "When helpful, add one short example or analogy that makes the idea easier to grasp.",
    "Reply in plain text only.",
    "",
    `Pack title: ${ideaContext.packTitle || "Unknown pack"}`,
    `Idea title: ${ideaContext.ideaTitle || "Unknown idea"}`,
    `Pack format: ${ideaContext.packFormat || "cards"}`,
    `Hook: ${ideaContext.hook || "None provided."}`,
    `Learning goal: ${ideaContext.learningGoal || "None provided."}`,
    `Target platform: ${ideaContext.targetPlatform || "None provided."}`,
    `Video style: ${ideaContext.videoStyle || "None provided."}`,
    `Caption style: ${ideaContext.captionStyle || "None provided."}`,
    `Music cue: ${ideaContext.musicCue || "None provided."}`,
    "",
    "Lesson cards:",
    lessonCardLines,
    "",
    "Short scenes:",
    shortSceneLines,
    "",
    "Summary bullets:",
    summaryLines,
    "",
    `Reflection prompt: ${ideaContext.reflectionPrompt || "None provided."}`,
    "",
    `Narration script: ${ideaContext.narrationScript || "None provided."}`,
    "",
    "Practice questions:",
    practiceLines,
    "",
    "Conversation:",
    conversationLines,
    "",
    "Tutor reply:",
  ].join("\n");
}
