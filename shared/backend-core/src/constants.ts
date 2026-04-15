export const accentPalette = ["#C98706", "#DA6B1B", "#4C8B77", "#7F6CE0", "#D45A2D"];

export const iconPalette = [
  "psychology",
  "flare",
  "travel-explore",
  "savings",
  "lightbulb",
  "straighten",
  "bolt",
];

export const ENGLISH_STOPWORDS = [
  "the",
  "and",
  "that",
  "with",
  "from",
  "this",
  "your",
  "into",
  "have",
  "will",
  "what",
  "when",
];

export const DANISH_STOPWORDS = [
  "og",
  "det",
  "ikke",
  "med",
  "for",
  "som",
  "til",
  "den",
  "på",
  "af",
  "er",
  "hvad",
];

export type LanguageProfile = {
  code: string;
  name: string;
  generationSteps: string[];
  defaults: {
    title: string;
    subtitle: string;
    author: string;
    category: string;
    description: string;
    heroLine: string;
    minutesPerIdea: string;
    coverLabel: string;
    coverLines: string[];
    teaser: string;
    lessonEyebrow: string;
    lessonTitle: string;
    lessonBody: string;
    lessonSupport: string;
    reflectionPrompt: string;
    practiceQuestion: string;
    practiceOptions: string[];
    practiceExplanation: string;
    shortHook: string;
    shortLearningGoal: string;
    shortTargetPlatform: string;
    shortVideoStyle: string;
    shortCaptionStyle: string;
    shortMusicCue: string;
    shortSceneHeadline: string;
    shortSceneBody: string;
    shortSceneCallout: string;
    shortSceneCaptionLine: string;
    shortSceneMotionHint: string;
    shortSceneTransitionHint: string;
  };
};

export const LANGUAGE_PROFILES: Record<string, LanguageProfile> = {
  en: {
    code: "en",
    name: "English",
    generationSteps: [
      "Upload a source",
      "Split it into ideas",
      "Generate lesson cards",
      "Add practice questions",
      "Publish the pack",
    ],
    defaults: {
      title: "AI Learning Pack",
      subtitle: "A short lesson pack generated from your source material.",
      author: "AI Studio",
      category: "Knowledge",
      description:
        "Dense source material reshaped into bite-sized ideas, practical review, and several checks.",
      heroLine:
        "The backend generated a learning pack you can read, review, and practice in one flow.",
      minutesPerIdea: "4-5 min",
      coverLabel: "AI GENERATED",
      coverLines: ["AI", "LEARNING", "PACK"],
      teaser: "A short lesson generated from your source.",
      lessonEyebrow: "Key moment",
      lessonTitle: "Main point",
      lessonBody: "This lesson card needs more detail.",
      lessonSupport: "Use the source to pressure-test the idea.",
      reflectionPrompt: "Where could this idea change a decision you are making?",
      practiceQuestion: "Which choice best fits the lesson?",
      practiceOptions: ["Option 1", "Option 2", "Option 3"],
      practiceExplanation:
        "Review the lesson and compare the answer against the missing evidence.",
      shortHook: "Why does this idea matter right now?",
      shortLearningGoal: "Understand the core move behind this idea in one short lesson.",
      shortTargetPlatform: "TikTok or Reels style vertical lesson",
      shortVideoStyle: "Punchy vertical explainer with clean visual beats",
      shortCaptionStyle: "Bold mobile captions with 1-2 short lines",
      shortMusicCue: "Warm minimal beat, low volume under narration",
      shortSceneHeadline: "Key move",
      shortSceneBody: "This scene needs a clearer, more concrete explanation.",
      shortSceneCallout: "Key term",
      shortSceneCaptionLine: "See the key move in one glance.",
      shortSceneMotionHint: "Slow push toward the main concept",
      shortSceneTransitionHint: "Quick cut to the next beat",
    },
  },
  ko: {
    code: "ko",
    name: "Korean",
    generationSteps: [
      "원문 업로드",
      "핵심 아이디어 분해",
      "레슨 카드 생성",
      "연습 문제 추가",
      "팩 완성",
    ],
    defaults: {
      title: "AI 학습 팩",
      subtitle: "원문을 바탕으로 만든 짧은 학습 팩입니다.",
      author: "AI Studio",
      category: "학습",
      description: "원문을 카드, 복습, 퀴즈 흐름으로 재구성한 학습 팩입니다.",
      heroLine: "읽고, 복습하고, 연습까지 한 흐름으로 이어지는 학습 팩을 만들었어요.",
      minutesPerIdea: "4-5분",
      coverLabel: "AI 생성",
      coverLines: ["짧고", "선명한", "학습"],
      teaser: "원문에서 뽑아낸 짧은 레슨입니다.",
      lessonEyebrow: "핵심 포인트",
      lessonTitle: "핵심 내용",
      lessonBody: "이 레슨 카드에 더 구체적인 설명이 필요합니다.",
      lessonSupport: "원문을 바탕으로 이 핵심을 다시 점검해 보세요.",
      reflectionPrompt: "이 아이디어가 지금 내 판단을 어디에서 바꿀 수 있을까요?",
      practiceQuestion: "이 레슨에 가장 잘 맞는 선택지는 무엇일까요?",
      practiceOptions: ["선택지 1", "선택지 2", "선택지 3"],
      practiceExplanation: "레슨을 다시 보고, 어떤 근거가 핵심이었는지 비교해 보세요.",
      shortHook: "이 아이디어가 왜 지금 중요한가요?",
      shortLearningGoal: "이 아이디어의 핵심 움직임을 짧은 강의로 이해합니다.",
      shortTargetPlatform: "틱톡·릴스형 세로 강의",
      shortVideoStyle: "핵심만 빠르게 들어오는 세로형 설명 쇼츠",
      shortCaptionStyle: "굵고 짧은 1-2줄 모바일 자막",
      shortMusicCue: "내레이션 아래에 깔리는 잔잔한 리듬감",
      shortSceneHeadline: "핵심 장면",
      shortSceneBody: "이 장면을 더 선명하고 구체적으로 설명해 주세요.",
      shortSceneCallout: "핵심 용어",
      shortSceneCaptionLine: "이 장면의 핵심을 한눈에 보여주세요.",
      shortSceneMotionHint: "핵심 개념 쪽으로 천천히 줌인",
      shortSceneTransitionHint: "다음 장면으로 빠르게 컷 전환",
    },
  },
  da: {
    code: "da",
    name: "Danish",
    generationSteps: [
      "Upload en kilde",
      "Del den op i ideer",
      "Lav lektionskort",
      "Tilføj øvelsesspørgsmål",
      "Færdiggør pakken",
    ],
    defaults: {
      title: "AI-læringspakke",
      subtitle: "En kort læringspakke skabt ud fra dit kildemateriale.",
      author: "AI Studio",
      category: "Viden",
      description:
        "Tæt kildemateriale omsat til korte ideer, repetition og en praktisk øvelsesopgave.",
      heroLine: "Backenden har skabt en læringspakke, du kan læse, repetere og øve i et flow.",
      minutesPerIdea: "4-5 min",
      coverLabel: "AI PAKKE",
      coverLines: ["KORT", "KLAR", "LÆRING"],
      teaser: "En kort lektion skabt ud fra din kilde.",
      lessonEyebrow: "Nøglepunkt",
      lessonTitle: "Hovedpointe",
      lessonBody: "Dette lektionskort mangler flere konkrete detaljer.",
      lessonSupport: "Brug kilden til at efterprøve ideen.",
      reflectionPrompt: "Hvor kunne denne idé ændre en beslutning, du står overfor?",
      practiceQuestion: "Hvilket svar passer bedst til lektionen?",
      practiceOptions: ["Mulighed 1", "Mulighed 2", "Mulighed 3"],
      practiceExplanation:
        "Se på lektionen igen og sammenlign svaret med den vigtigste dokumentation.",
      shortHook: "Hvorfor betyder denne idé noget lige nu?",
      shortLearningGoal: "Forstå kernetrækket i denne idé som en kort lektion.",
      shortTargetPlatform: "Vertikal lektion i TikTok- eller Reels-stil",
      shortVideoStyle: "Kort, tydelig vertikal forklaring med stærke billedslag",
      shortCaptionStyle: "Store mobiltekster i 1-2 korte linjer",
      shortMusicCue: "Diskret varm rytme under fortællerstemmen",
      shortSceneHeadline: "Nøglescene",
      shortSceneBody: "Denne scene har brug for en klarere og mere konkret forklaring.",
      shortSceneCallout: "Nøgleterm",
      shortSceneCaptionLine: "Vis scenens nøglepointe med et hurtigt blik.",
      shortSceneMotionHint: "Langsom bevægelse mod hovedideen",
      shortSceneTransitionHint: "Hurtigt klip til næste beat",
    },
  },
};

export const UNKNOWN_LANGUAGE_PROFILE: LanguageProfile = {
  code: "unknown",
  name: "the dominant language of the source material",
  generationSteps: LANGUAGE_PROFILES.en.generationSteps,
  defaults: LANGUAGE_PROFILES.en.defaults,
};

export const LENGTH_LIMITS = {
  packTitle: 48,
  subtitle: 96,
  author: 40,
  category: 32,
  description: 520,
  heroLine: 180,
  minutesPerIdea: 18,
  coverLabel: 24,
  coverLine: 18,
  ideaTitle: 110,
  duration: 18,
  teaser: 180,
  lessonEyebrow: 24,
  lessonTitle: 40,
  lessonBody: 1600,
  lessonSupport: 900,
  summaryBullet: 180,
  reflectionPrompt: 140,
  practiceQuestion: 180,
  practiceOption: 90,
  practiceExplanation: 280,
  shortHook: 180,
  shortLearningGoal: 220,
  shortTargetPlatform: 120,
  shortVideoStyle: 180,
  shortCaptionStyle: 140,
  shortMusicCue: 160,
  shortCoverSceneId: 80,
  shortNarrationScript: 4200,
  sceneHeadline: 90,
  sceneBody: 420,
  sceneNarration: 700,
  sceneCallout: 100,
  sceneCaptionLine: 120,
  sceneEmphasisWord: 36,
  sceneVisualStyle: 120,
  sceneLayoutHint: 120,
  sceneMotionHint: 120,
  sceneTransitionHint: 120,
  ttsProvider: 24,
  ttsVoice: 64,
  ttsAudioPath: 240,
} as const;

export const IDEA_CHAT_MAX_MESSAGES = 10;
export const IDEA_CHAT_MAX_MESSAGE_LENGTH = 500;

export const IDEA_CHAT_LIMITS = {
  packTitle: 48,
  ideaTitle: 36,
  lessonEyebrow: 24,
  lessonTitle: 40,
  lessonBody: 620,
  lessonSupport: 420,
  summaryBullet: 160,
  reflectionPrompt: 180,
  practiceQuestion: 160,
  practiceOption: 80,
  practiceExplanation: 140,
  shortHook: 180,
  shortLearningGoal: 180,
  shortNarrationScript: 1600,
  shortTargetPlatform: 100,
  shortVideoStyle: 140,
  shortCaptionStyle: 120,
  shortMusicCue: 120,
  sceneHeadline: 80,
  sceneBody: 360,
  sceneNarration: 420,
  sceneCallout: 72,
  sceneCaptionLine: 100,
  sceneEmphasisWord: 30,
  sceneMotionHint: 100,
  sceneTransitionHint: 100,
} as const;

export const CHUNK_CHAR_THRESHOLD = 4500;
export const CHUNK_TARGET_SIZE = 3000;

export const chunkIdeasSchema = {
  type: "object",
  additionalProperties: false,
  required: ["ideas"],
  properties: {
    ideas: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "section",
          "title",
          "duration",
          "teaser",
          "lessonCards",
          "summaryBullets",
          "reflectionPrompt",
          "practice",
        ],
        properties: {
          section: { type: "string" },
          title: { type: "string", maxLength: LENGTH_LIMITS.ideaTitle },
          duration: { type: "string", maxLength: LENGTH_LIMITS.duration },
          teaser: { type: "string", maxLength: LENGTH_LIMITS.teaser },
          lessonCards: {
            type: "array",
            minItems: 1,
            maxItems: 24,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["eyebrow", "title", "body", "support"],
              properties: {
                eyebrow: { type: "string", maxLength: LENGTH_LIMITS.lessonEyebrow },
                title: { type: "string", maxLength: LENGTH_LIMITS.lessonTitle },
                body: { type: "string", maxLength: LENGTH_LIMITS.lessonBody },
                support: { type: "string", maxLength: LENGTH_LIMITS.lessonSupport },
              },
            },
          },
          summaryBullets: {
            type: "array",
            minItems: 2,
            maxItems: 12,
            items: { type: "string", maxLength: LENGTH_LIMITS.summaryBullet },
          },
          reflectionPrompt: { type: "string", maxLength: LENGTH_LIMITS.reflectionPrompt },
          practice: {
            type: "object",
            additionalProperties: false,
            required: ["questions"],
            properties: {
              questions: {
                type: "array",
                minItems: 5,
                maxItems: 5,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["question", "options", "correctIndex", "explanation"],
                  properties: {
                    question: { type: "string", maxLength: LENGTH_LIMITS.practiceQuestion },
                    options: {
                      type: "array",
                      minItems: 3,
                      maxItems: 3,
                      items: { type: "string", maxLength: LENGTH_LIMITS.practiceOption },
                    },
                    correctIndex: { type: "integer", minimum: 0, maximum: 2 },
                    explanation: { type: "string", maxLength: LENGTH_LIMITS.practiceExplanation },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

export const packMetaSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "subtitle",
    "author",
    "category",
    "description",
    "heroLine",
    "minutesPerIdea",
    "coverLabel",
    "coverLines",
    "packReview",
  ],
  properties: {
    title: { type: "string", maxLength: LENGTH_LIMITS.packTitle },
    subtitle: { type: "string", maxLength: LENGTH_LIMITS.subtitle },
    author: { type: "string", maxLength: LENGTH_LIMITS.author },
    category: { type: "string", maxLength: LENGTH_LIMITS.category },
    description: { type: "string", maxLength: LENGTH_LIMITS.description },
    heroLine: { type: "string", maxLength: LENGTH_LIMITS.heroLine },
    minutesPerIdea: { type: "string", maxLength: LENGTH_LIMITS.minutesPerIdea },
    coverLabel: { type: "string", maxLength: LENGTH_LIMITS.coverLabel },
    coverLines: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: { type: "string", maxLength: LENGTH_LIMITS.coverLine },
    },
    packReview: {
      type: "object",
      additionalProperties: false,
      required: ["questions"],
      properties: {
        questions: {
          type: "array",
          minItems: 5,
          maxItems: 30,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["question", "options", "correctIndex", "explanation"],
            properties: {
              question: { type: "string", maxLength: LENGTH_LIMITS.practiceQuestion },
              options: {
                type: "array",
                minItems: 3,
                maxItems: 3,
                items: { type: "string", maxLength: LENGTH_LIMITS.practiceOption },
              },
              correctIndex: { type: "integer", minimum: 0, maximum: 2 },
              explanation: { type: "string", maxLength: LENGTH_LIMITS.practiceExplanation },
            },
          },
        },
      },
    },
  },
};

export const packSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "subtitle",
    "author",
    "category",
    "description",
    "heroLine",
    "minutesPerIdea",
    "coverLabel",
    "coverLines",
    "packReview",
    "ideas",
  ],
  properties: {
    title: { type: "string", maxLength: LENGTH_LIMITS.packTitle },
    subtitle: { type: "string", maxLength: LENGTH_LIMITS.subtitle },
    author: { type: "string", maxLength: LENGTH_LIMITS.author },
    category: { type: "string", maxLength: LENGTH_LIMITS.category },
    description: { type: "string", maxLength: LENGTH_LIMITS.description },
    heroLine: { type: "string", maxLength: LENGTH_LIMITS.heroLine },
    minutesPerIdea: { type: "string", maxLength: LENGTH_LIMITS.minutesPerIdea },
    coverLabel: { type: "string", maxLength: LENGTH_LIMITS.coverLabel },
    coverLines: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: { type: "string", maxLength: LENGTH_LIMITS.coverLine },
    },
    packReview: {
      type: "object",
      additionalProperties: false,
      required: ["questions"],
      properties: {
        questions: {
          type: "array",
          minItems: 5,
          maxItems: 30,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["question", "options", "correctIndex", "explanation"],
            properties: {
              question: { type: "string", maxLength: LENGTH_LIMITS.practiceQuestion },
              options: {
                type: "array",
                minItems: 3,
                maxItems: 3,
                items: { type: "string", maxLength: LENGTH_LIMITS.practiceOption },
              },
              correctIndex: { type: "integer", minimum: 0, maximum: 2 },
              explanation: { type: "string", maxLength: LENGTH_LIMITS.practiceExplanation },
            },
          },
        },
      },
    },
    ideas: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "section",
          "title",
          "duration",
          "teaser",
          "lessonCards",
          "summaryBullets",
          "reflectionPrompt",
          "practice",
        ],
        properties: {
          section: { type: "string" },
          title: { type: "string", maxLength: LENGTH_LIMITS.ideaTitle },
          duration: { type: "string", maxLength: LENGTH_LIMITS.duration },
          teaser: { type: "string", maxLength: LENGTH_LIMITS.teaser },
          lessonCards: {
            type: "array",
            minItems: 1,
            maxItems: 24,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["eyebrow", "title", "body", "support"],
              properties: {
                eyebrow: { type: "string", maxLength: LENGTH_LIMITS.lessonEyebrow },
                title: { type: "string", maxLength: LENGTH_LIMITS.lessonTitle },
                body: { type: "string", maxLength: LENGTH_LIMITS.lessonBody },
                support: { type: "string", maxLength: LENGTH_LIMITS.lessonSupport },
              },
            },
          },
          summaryBullets: {
            type: "array",
            minItems: 2,
            maxItems: 12,
            items: { type: "string", maxLength: LENGTH_LIMITS.summaryBullet },
          },
          reflectionPrompt: { type: "string", maxLength: LENGTH_LIMITS.reflectionPrompt },
          practice: {
            type: "object",
            additionalProperties: false,
            required: ["questions"],
            properties: {
              questions: {
                type: "array",
                minItems: 5,
                maxItems: 5,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["question", "options", "correctIndex", "explanation"],
                  properties: {
                    question: { type: "string", maxLength: LENGTH_LIMITS.practiceQuestion },
                    options: {
                      type: "array",
                      minItems: 3,
                      maxItems: 3,
                      items: { type: "string", maxLength: LENGTH_LIMITS.practiceOption },
                    },
                    correctIndex: { type: "integer", minimum: 0, maximum: 2 },
                    explanation: { type: "string", maxLength: LENGTH_LIMITS.practiceExplanation },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

export const shortIdeaOutlineSchema = {
  type: "object",
  additionalProperties: false,
  required: ["ideas"],
  properties: {
    ideas: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["section", "title", "teaser", "durationSec"],
        properties: {
          section: { type: "string", maxLength: 60 },
          title: { type: "string", maxLength: LENGTH_LIMITS.ideaTitle },
          teaser: { type: "string", maxLength: LENGTH_LIMITS.teaser },
          durationSec: { type: "integer", minimum: 45, maximum: 300 },
        },
      },
    },
  },
};

export const shortIdeaStoryboardSchema = {
  type: "object",
  additionalProperties: false,
  required: ["section", "title", "teaser", "durationSec", "clips", "quiz"],
  properties: {
    section: { type: "string", maxLength: 60 },
    title: { type: "string", maxLength: LENGTH_LIMITS.ideaTitle },
    teaser: { type: "string", maxLength: LENGTH_LIMITS.teaser },
    durationSec: { type: "integer", minimum: 45, maximum: 300 },
    clips: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "title",
          "teaser",
          "durationSec",
          "hook",
          "learningGoal",
          "targetPlatform",
          "videoStyle",
          "captionStyle",
          "musicCue",
          "coverSceneId",
          "narrationScript",
          "scenes",
        ],
        properties: {
          title: { type: "string", maxLength: LENGTH_LIMITS.ideaTitle },
          teaser: { type: "string", maxLength: LENGTH_LIMITS.teaser },
          durationSec: { type: "integer", minimum: 25, maximum: 90 },
          hook: { type: "string", maxLength: LENGTH_LIMITS.shortHook },
          learningGoal: { type: "string", maxLength: LENGTH_LIMITS.shortLearningGoal },
          targetPlatform: { type: "string", maxLength: LENGTH_LIMITS.shortTargetPlatform },
          videoStyle: { type: "string", maxLength: LENGTH_LIMITS.shortVideoStyle },
          captionStyle: { type: "string", maxLength: LENGTH_LIMITS.shortCaptionStyle },
          musicCue: { type: "string", maxLength: LENGTH_LIMITS.shortMusicCue },
          coverSceneId: { type: "string", maxLength: LENGTH_LIMITS.shortCoverSceneId },
          narrationScript: { type: "string", maxLength: LENGTH_LIMITS.shortNarrationScript },
          scenes: {
            type: "array",
            minItems: 2,
            maxItems: 7,
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "order",
                "headline",
                "body",
                "narration",
                "callouts",
                "captionLines",
                "emphasisWords",
                "visualStyle",
                "layoutHint",
                "motionHint",
                "transitionHint",
                "estimatedSec",
              ],
              properties: {
                order: { type: "integer", minimum: 1, maximum: 7 },
                headline: { type: "string", maxLength: LENGTH_LIMITS.sceneHeadline },
                body: { type: "string", maxLength: LENGTH_LIMITS.sceneBody },
                narration: { type: "string", maxLength: LENGTH_LIMITS.sceneNarration },
                callouts: {
                  type: "array",
                  minItems: 1,
                  maxItems: 4,
                  items: { type: "string", maxLength: LENGTH_LIMITS.sceneCallout },
                },
                captionLines: {
                  type: "array",
                  minItems: 1,
                  maxItems: 3,
                  items: { type: "string", maxLength: LENGTH_LIMITS.sceneCaptionLine },
                },
                emphasisWords: {
                  type: "array",
                  maxItems: 4,
                  items: { type: "string", maxLength: LENGTH_LIMITS.sceneEmphasisWord },
                },
                visualStyle: { type: "string", maxLength: LENGTH_LIMITS.sceneVisualStyle },
                layoutHint: { type: "string", maxLength: LENGTH_LIMITS.sceneLayoutHint },
                motionHint: { type: "string", maxLength: LENGTH_LIMITS.sceneMotionHint },
                transitionHint: { type: "string", maxLength: LENGTH_LIMITS.sceneTransitionHint },
                estimatedSec: { type: "integer", minimum: 6, maximum: 30 },
              },
            },
          },
        },
      },
    },
    quiz: {
      type: "object",
      additionalProperties: false,
      required: ["questions"],
      properties: {
        questions: {
          type: "array",
          minItems: 3,
          maxItems: 3,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["question", "options", "correctIndex", "explanation"],
            properties: {
              question: { type: "string", maxLength: LENGTH_LIMITS.practiceQuestion },
              options: {
                type: "array",
                minItems: 3,
                maxItems: 3,
                items: { type: "string", maxLength: LENGTH_LIMITS.practiceOption },
              },
              correctIndex: { type: "integer", minimum: 0, maximum: 2 },
              explanation: { type: "string", maxLength: LENGTH_LIMITS.practiceExplanation },
            },
          },
        },
      },
    },
  },
};

export const shortsPackMetaSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "subtitle",
    "author",
    "category",
    "description",
    "heroLine",
    "minutesPerIdea",
    "coverLabel",
    "coverLines",
  ],
  properties: {
    title: { type: "string", maxLength: LENGTH_LIMITS.packTitle },
    subtitle: { type: "string", maxLength: LENGTH_LIMITS.subtitle },
    author: { type: "string", maxLength: LENGTH_LIMITS.author },
    category: { type: "string", maxLength: LENGTH_LIMITS.category },
    description: { type: "string", maxLength: LENGTH_LIMITS.description },
    heroLine: { type: "string", maxLength: LENGTH_LIMITS.heroLine },
    minutesPerIdea: { type: "string", maxLength: LENGTH_LIMITS.minutesPerIdea },
    coverLabel: { type: "string", maxLength: LENGTH_LIMITS.coverLabel },
    coverLines: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: { type: "string", maxLength: LENGTH_LIMITS.coverLine },
    },
  },
};
