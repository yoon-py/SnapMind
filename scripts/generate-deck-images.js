#!/usr/bin/env node
// Generate non-text visual assets for a SnapMind deck JSON.
// Usage: node scripts/generate-deck-images.js [deckJsonPath] [outDir]

require("dotenv").config();

const fs = require("fs");
const path = require("path");

const {
  buildDeckSlideImagePrompt,
} = require("../shared/backend-core/dist/cjs/deckMedia");
const {
  generateShortSceneImage,
  resolveGeminiImageConfig,
} = require("../shared/backend-core/dist/cjs/geminiImage");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function slugify(value, fallback = "deck") {
  const slug = String(value || "")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
  return slug || fallback;
}

function adaptPackToDeck(pack) {
  if (pack?.format === "deck" && Array.isArray(pack.slides)) {
    return pack;
  }

  const slides = [];
  for (const idea of pack?.ideas || []) {
    const clips = Array.isArray(idea?.clips) && idea.clips.length > 0
      ? idea.clips
      : idea?.short
        ? [idea.short]
        : [];

    for (const clip of clips) {
      for (const scene of clip?.scenes || []) {
        slides.push({
          id: scene.id || `slide-${slides.length + 1}`,
          order: slides.length + 1,
          section: idea.section || idea.title || "",
          title: scene.headline || clip.title || idea.title || `Slide ${slides.length + 1}`,
          thesis: scene.body || scene.narration || clip.teaser || idea.teaser || "",
          layout: slides.length === 0
            ? "hero_blueprint"
            : slides.length % 4 === 0
              ? "comparison_matrix"
              : slides.length % 3 === 0
                ? "process_pipeline"
                : "concept_map",
          visualMetaphor: scene.visualStyle || scene.layoutHint || "",
          textBlocks: [
            { role: "headline", text: scene.headline || clip.title || idea.title || "" },
            ...(scene.captionLines || []).map((line) => ({ role: "callout", text: line })),
            { role: "body", text: scene.body || scene.narration || "" },
          ].filter((block) => block.text),
          diagram: {
            nodes: (scene.callouts || []).map((callout, index) => ({
              id: `node-${index + 1}`,
              label: callout,
              role: index === 0 ? "core concept" : "supporting cue",
            })),
            edges: [],
            steps: (scene.captionLines || []).map((line) => ({
              label: line,
              detail: scene.body || scene.narration || "",
            })),
            rows: [],
          },
          imagePrompt: scene.imagePrompt || "",
          speakerNotes: scene.narration || "",
        });
      }
    }
  }

  return {
    ...pack,
    format: "deck",
    theme: "blueprint",
    slides,
  };
}

async function runWithConcurrency(items, limit, worker) {
  let nextIndex = 0;
  async function loop() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, loop));
}

async function main() {
  const inputPath = path.resolve(process.argv[2] || "/tmp/snapmind_deck.json");
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Deck JSON not found: ${inputPath}`);
  }

  const rawPack = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const pack = adaptPackToDeck(rawPack);
  if (!Array.isArray(pack.slides) || pack.slides.length === 0) {
    throw new Error("The pack does not contain deck slides and could not be adapted.");
  }

  const imageConfig = resolveGeminiImageConfig({
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_IMAGE_MODEL,
  });
  if (!imageConfig) {
    throw new Error("GEMINI_API_KEY is required for deck image generation.");
  }

  const outDir = process.argv[3]
    ? path.resolve(process.argv[3])
    : path.resolve(__dirname, "..", "artifacts", "decks", slugify(pack.id || pack.title || "deck"));
  const assetsDir = path.join(outDir, "assets");
  ensureDir(assetsDir);

  const slides = pack.slides.map((slide) => ({ ...slide }));
  const concurrency = Math.max(1, Number(process.env.DECK_IMAGE_CONCURRENCY || 2));

  await runWithConcurrency(slides, concurrency, async (slide, index) => {
    const prompt = buildDeckSlideImagePrompt({ pack, slide });
    console.log(`[deck-image] ${index + 1}/${slides.length}: ${slide.title}`);
    const image = await generateShortSceneImage({
      config: imageConfig,
      prompt,
    });
    const fileName = `${String(index + 1).padStart(2, "0")}-${slugify(slide.id || slide.title, `slide-${index + 1}`)}.${image.fileExtension || "png"}`;
    const filePath = path.join(assetsDir, fileName);
    fs.writeFileSync(filePath, Buffer.from(image.imageBytes));
    slides[index] = {
      ...slide,
      imagePrompt: prompt,
      visual: {
        ...(slide.visual || {}),
        provider: "gemini-image",
        model: image.model,
        imageStatus: "ready",
        localImageFile: `assets/${fileName}`,
        mimeType: image.mimeType,
      },
    };
  });

  const deckWithImages = {
    ...pack,
    slides,
  };
  const jsonPath = path.join(outDir, "deck-with-images.json");
  fs.writeFileSync(jsonPath, JSON.stringify(deckWithImages, null, 2));
  console.log(`Deck images written: ${assetsDir}`);
  console.log(`Updated deck JSON: ${jsonPath}`);
  console.log(`Render with: node scripts/render-deck-preview.js ${jsonPath} ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
