const test = require("node:test");
const assert = require("node:assert/strict");

const { detectSourceLanguage } = require("../lib/learningPack");
const {
  generatePackFromSource,
  splitSourceIntoChunks,
} = require("../../shared/backend-core/dist/cjs/generation");
const { enrichDeckPackWithImages } = require("../../shared/backend-core/dist/cjs/deckMedia");
const {
  hasIdeaContext,
  normalizeIdeaContext,
} = require("../../shared/backend-core/dist/cjs/ideaChat");

test("detectSourceLanguage recognizes Korean text", () => {
  const language = detectSourceLanguage("이 문서는 한국어로 작성된 학습 자료입니다. 핵심 개념과 예시를 설명합니다.");

  assert.equal(language.code, "ko");
});

test("detectSourceLanguage recognizes English text", () => {
  const language = detectSourceLanguage(
    "This chapter explains the main concept and shows what the learner should notice in the example."
  );

  assert.equal(language.code, "en");
});

test("detectSourceLanguage recognizes Danish text", () => {
  const language = detectSourceLanguage(
    "Dette afsnit forklarer idéen og viser, hvordan eleven kan bruge den i en enkel situation."
  );

  assert.equal(language.code, "da");
});

test("splitSourceIntoChunks splits long chaptered sources", () => {
  const source = Array.from({ length: 4 }, (_, index) => {
    return `Chapter ${index + 1}\n${"This section contains detailed explanation, examples, formulas, and definitions. ".repeat(45)}`;
  }).join("\n\n");

  const chunks = splitSourceIntoChunks(source);

  assert.ok(chunks.length >= 2);
  assert.ok(chunks.every((chunk) => chunk.includes("Chapter")));
});

test("generatePackFromSource still supports cards packs when explicitly requested", async () => {
  const source = Array.from({ length: 4 }, (_, index) => {
    return `Chapter ${index + 1}\n${"This section contains detailed explanation, examples, formulas, and definitions. ".repeat(45)}`;
  }).join("\n\n");

  const chunkIdea = (index) => ({
    section: `Section ${index}`,
    title: `Idea ${index}`,
    duration: "4-5 min",
    teaser: "A detailed teaser that keeps the source meaning intact.",
    lessonCards: Array.from({ length: 6 }, (_, cardIndex) => ({
      eyebrow: `Point ${cardIndex + 1}`,
      title: `Card ${cardIndex + 1}`,
      body: "Sentence one. Sentence two. Sentence three. Sentence four.",
      support: "Helpful supporting example.",
    })),
    summaryBullets: ["First takeaway", "Second takeaway", "Third takeaway"],
    reflectionPrompt: "Where could this idea matter?",
    practice: {
      questions: Array.from({ length: 5 }, (_, questionIndex) => ({
        question: `Question ${questionIndex + 1}?`,
        options: ["Option A", "Option B", "Option C"],
        correctIndex: 0,
        explanation: "Option A best matches the idea.",
      })),
    },
  });

  const callSequence = [];
  let chunkCallCount = 0;

  const result = await generatePackFromSource({
    sourceText: source,
    packFormat: "cards",
    llmProvider: "gemini",
    generateLLM: async ({ jsonSchema }) => {
      callSequence.push(jsonSchema?.name || "unknown");

      if (jsonSchema?.name === "chunk_ideas") {
        chunkCallCount += 1;
        return {
          output_text: JSON.stringify({
            ideas: [chunkIdea(chunkCallCount)],
          }),
        };
      }

      if (jsonSchema?.name === "pack_meta") {
        return {
          output_text: JSON.stringify({
            title: "Long Source Pack",
            subtitle: "Detailed pack subtitle",
            author: "AI Studio",
            category: "Knowledge",
            description: "A pack built from multiple generated chunks.",
            heroLine: "This pack keeps more of the source by merging chunk outputs.",
            minutesPerIdea: "5-7 min",
            coverLabel: "AI GENERATED",
            coverLines: ["LONG", "SOURCE", "PACK"],
            packReview: {
              questions: Array.from({ length: 10 }, (_, questionIndex) => ({
                question: `Review ${questionIndex + 1}?`,
                options: ["Option A", "Option B", "Option C"],
                correctIndex: 0,
                explanation: "Option A best matches the review.",
              })),
            },
          }),
        };
      }

      throw new Error(`Unexpected schema request: ${jsonSchema?.name}`);
    },
  });

  assert.ok(chunkCallCount >= 2);
  assert.equal(callSequence.at(-1), "pack_meta");
  assert.ok(result.pack.ideas.length >= 2);
});

test("generatePackFromSource creates visual deck packs when requested", async () => {
  const result = await generatePackFromSource({
    sourceText: "Chapter 1\nAI systems learn patterns from data and use models to infer useful answers.",
    packFormat: "deck",
    llmProvider: "gemini",
    generateLLM: async ({ jsonSchema }) => {
      assert.equal(jsonSchema?.name, "deck_pack");
      return {
        output_text: JSON.stringify({
          title: "AI Blueprint",
          subtitle: "A visual guide to AI systems",
          author: "AI Studio",
          category: "Technology",
          description: "A blueprint-style deck about data, models, and inference.",
          theme: "blueprint",
          audience: "self-study learners",
          slides: Array.from({ length: 4 }, (_, index) => ({
            order: index + 1,
            section: "AI systems",
            title: `Slide ${index + 1}`,
            thesis: "Data flows into a model, and the model produces an inference.",
            layout: index === 0 ? "hero_blueprint" : "process_pipeline",
            visualMetaphor: "A technical blueprint showing data moving through a model.",
            textBlocks: [
              { role: "headline", text: `Slide ${index + 1}` },
              { role: "body", text: "Data, model, and inference each play a distinct role." },
            ],
            diagram: {
              nodes: [
                { id: "data", label: "Data", role: "raw input" },
                { id: "model", label: "Model", role: "learned pattern" },
              ],
              edges: [{ from: "data", to: "model", label: "trained into" }],
              steps: [
                { label: "Data", detail: "examples enter the system" },
                { label: "Model", detail: "patterns are represented" },
                { label: "Inference", detail: "new answers are produced" },
              ],
              rows: [],
            },
            imagePrompt: "Blueprint-style non-text illustration of data flowing through a model.",
            speakerNotes: "Explain how data, models, and inference connect.",
          })),
        }),
      };
    },
  });

  assert.equal(result.pack.format, "deck");
  assert.equal(result.pack.slides.length, 4);
  assert.equal(result.pack.ideas.length, 4);
});

test("enrichDeckPackWithImages marks deck visuals disabled when generation is off", async () => {
  const pack = {
    id: "deck-test",
    format: "deck",
    title: "Deck Test",
    slides: [
      {
        id: "slide-1",
        order: 1,
        title: "Model Flow",
        thesis: "Data becomes inference through a model.",
        layout: "process_pipeline",
        visualMetaphor: "A blueprint machine moving blocks through pipes.",
        textBlocks: [{ role: "headline", text: "Model Flow" }],
        diagram: {
          nodes: [],
          edges: [],
          steps: [{ label: "Data", detail: "raw examples" }],
          rows: [],
        },
        imagePrompt: "",
        speakerNotes: "Explain the model flow.",
      },
    ],
    ideas: [{ id: "slide-1", deckSlideId: "slide-1" }],
  };

  const enriched = await enrichDeckPackWithImages({
    pack,
    generateDeckImages: false,
  });

  assert.equal(enriched.slides[0].visual.imageStatus, "disabled");
  assert.ok(enriched.slides[0].imagePrompt.includes("do NOT render readable text"));
});

test("generatePackFromSource creates a shorts pack with storyboard scenes and quiz by default", async () => {
  const source = [
    "Chapter 1",
    "Vectors describe magnitude and direction in a coordinate system.",
    "Matrices compress repeated linear transformations into a single object.",
  ].join("\n");

  const scene = (index) => ({
    order: index + 1,
    headline: `Scene ${index + 1}`,
    body: "Short on-screen explanation for this scene.",
    narration: "Narration that explains the concept more clearly than the on-screen text.",
    callouts: [`Callout ${index + 1}`],
    captionLines: [`Caption line ${index + 1}`],
    emphasisWords: [`Keyword ${index + 1}`],
    visualStyle: "clean blueprint slide",
    layoutHint: "headline-left, diagram-right",
    motionHint: "Slow push toward the diagram",
    transitionHint: "Quick cut to the next scene",
    estimatedSec: 15,
  });

  const result = await generatePackFromSource({
    sourceText: source,
    packFormat: "shorts",
    llmProvider: "openai",
    generateLLM: async ({ jsonSchema }) => {
      if (jsonSchema?.name === "short_idea_outlines") {
        return {
          output_text: JSON.stringify({
            ideas: [
              {
                section: "Chapter 1",
                title: "Vectors as positions",
                teaser: "Understand how vectors describe location and change.",
                durationSec: 75,
              },
            ],
          }),
        };
      }

      if (jsonSchema?.name === "short_idea_storyboard") {
        return {
          output_text: JSON.stringify({
            section: "Chapter 1",
            title: "Vectors as positions",
            teaser: "Understand how vectors describe location and change.",
            durationSec: 75,
            short: {
              hook: "Why does one arrow explain so much?",
              learningGoal: "See how vectors turn data into position and motion.",
              targetPlatform: "TikTok or Reels style vertical lesson",
              videoStyle: "Punchy vertical explainer with clean visual beats",
              captionStyle: "Bold mobile captions with 1-2 short lines",
              musicCue: "Warm minimal beat, low volume under narration",
              coverSceneId: "scene-1",
              narrationScript:
                "Vectors give us one clean way to talk about magnitude and direction at the same time.",
              scenes: Array.from({ length: 4 }, (_, index) => scene(index)),
            },
            quiz: {
              questions: Array.from({ length: 3 }, (_, index) => ({
                question: `Quiz question ${index + 1}?`,
                options: ["Option A", "Option B", "Option C"],
                correctIndex: 0,
                explanation: "Option A is the best match.",
              })),
            },
          }),
        };
      }

      if (jsonSchema?.name === "shorts_pack_meta") {
        return {
          output_text: JSON.stringify({
            title: "Blueprint Math",
            subtitle: "Short lecture pack generated from a source document.",
            author: "AI Studio",
            category: "Knowledge",
            description: "A short-lecture pack that turns source sections into narrated scenes.",
            heroLine: "Study one scene at a time, then check it with a short quiz.",
            minutesPerIdea: "60-90 sec",
            coverLabel: "AI GENERATED",
            coverLines: ["SHORT", "LECTURE", "PACK"],
          }),
        };
      }

      throw new Error(`Unexpected schema request: ${jsonSchema?.name}`);
    },
  });

  assert.equal(result.pack.format, "shorts");
  assert.equal(result.pack.packReview, null);
  assert.equal(result.pack.ideas.length, 1);
  assert.equal(result.pack.ideas[0].short.scenes.length, 4);
  assert.equal(result.pack.ideas[0].quiz.questions.length, 3);
  assert.equal(result.pack.ideas[0].short.tts.audioStatus, "pending");
  assert.equal(result.pack.ideas[0].short.targetPlatform, "TikTok or Reels style vertical lesson");
  assert.equal(result.pack.ideas[0].short.coverSceneId, result.pack.ideas[0].short.scenes[0].id);
  assert.deepEqual(result.pack.ideas[0].short.scenes[0].captionLines, ["Caption line 1"]);
  assert.equal(result.pack.ideas[0].short.scenes[0].motionHint, "Slow push toward the diagram");
});

test("normalizeIdeaContext keeps shorts tutor context", () => {
  const context = normalizeIdeaContext({
    packFormat: "shorts",
    packTitle: "Blueprint Math",
    ideaTitle: "Vectors as positions",
    hook: "Why does one arrow explain so much?",
    learningGoal: "Understand how vectors encode direction.",
    targetPlatform: "TikTok or Reels style vertical lesson",
    videoStyle: "Punchy vertical explainer with clean visual beats",
    captionStyle: "Bold mobile captions with 1-2 short lines",
    musicCue: "Warm minimal beat, low volume under narration",
    narrationScript: "Vectors combine magnitude and direction.",
    shortScenes: [
      {
        headline: "Start with an arrow",
        body: "A vector can be pictured as an arrow.",
        narration: "A vector is a clean way to describe both length and direction.",
        callouts: ["magnitude", "direction"],
        captionLines: ["One arrow, two ideas"],
        emphasisWords: ["magnitude"],
        motionHint: "Slow push toward the arrow",
        transitionHint: "Quick cut",
      },
    ],
    practiceQuestions: [
      {
        question: "What does a vector combine?",
        options: ["Magnitude and direction", "Only position", "Only angle"],
        explanation: "Vectors combine magnitude and direction.",
      },
    ],
  });

  assert.equal(context.packFormat, "shorts");
  assert.equal(context.shortScenes.length, 1);
  assert.equal(context.targetPlatform, "TikTok or Reels style vertical lesson");
  assert.deepEqual(context.shortScenes[0].captionLines, ["One arrow, two ideas"]);
  assert.equal(hasIdeaContext(context), true);
});
