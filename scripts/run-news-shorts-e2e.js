#!/usr/bin/env node

/**
 * News URL -> YouTube Shorts (MVP, one shot).
 *
 *   node scripts/run-news-shorts-e2e.js "<news-article-url>"
 *
 * Pipeline:
 *   1. fetchArticle(url)            -> body text + editorial images (NO AI image generation)
 *   2. generatePackFromSource()     -> shorts pack (reuses existing generator)
 *   3. matchScenesToMedia()         -> assign harvested photos to scenes (+ source credit)
 *   4. download photos + Gemini TTS -> local preview dir
 *   5. render-short-video.js        -> shorts.mp4 (ffmpeg: photo + caption + credit + voice)
 *
 * Requires: OPENAI_API_KEY (LLM), GEMINI_API_KEY (TTS). No image-generation cost.
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const OpenAI = require("openai");

const {
  fetchArticle,
  matchScenesToMedia,
} = require("../shared/backend-core/dist/cjs/articleMedia");
const { generatePackFromSource } = require("../shared/backend-core/dist/cjs/generation");
const {
  resolveGeminiTextToSpeechConfig,
  synthesizeShortAudio,
} = require("../shared/backend-core/dist/cjs/geminiTextToSpeech");

const OPENAI_CALL_TIMEOUT_MS = 120000;

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function sanitize(value, fallback = "item") {
  const cleaned = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || fallback;
}

function getOpenAiOutputText(response) {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }
  const output = Array.isArray(response.output) ? response.output : [];
  const parts = [];
  for (const item of output) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (typeof content?.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

function extFromContentType(contentType, fallbackUrl) {
  const ct = String(contentType || "").toLowerCase();
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  const m = String(fallbackUrl || "").match(/\.(jpe?g|png|webp|gif)(\?|$)/i);
  return m ? m[1].toLowerCase().replace("jpeg", "jpg") : "jpg";
}

async function downloadImage(url, destNoExt) {
  const response = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0", accept: "image/*,*/*;q=0.8" },
  });
  if (!response.ok) throw new Error(`image ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const ext = extFromContentType(response.headers.get("content-type"), url);
  const dest = `${destNoExt}.${ext}`;
  fs.writeFileSync(dest, buffer);
  return path.basename(dest);
}

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: node scripts/run-news-shorts-e2e.js "<news-article-url>"');
    process.exit(1);
  }
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required.");

  const projectRoot = path.resolve(__dirname, "..");
  const runStamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const previewDir = path.join(projectRoot, "artifacts", "news-shorts", `run-${runStamp}`);
  ensureDir(previewDir);

  // 1. Harvest article ---------------------------------------------------------
  console.log(`[1/5] fetching article: ${url}`);
  const article = await fetchArticle({ url });
  console.log(
    `      title="${article.title}"  body=${article.bodyText.length} chars  images=${article.images.length}`
  );
  if (article.bodyText.length < 200) {
    throw new Error("Article body too short — the parser could not extract usable text from this URL.");
  }
  if (article.images.length === 0) {
    console.warn("      WARNING: no editorial images found; video will reuse whatever is available.");
  }

  // 2. Generate shorts pack ----------------------------------------------------
  console.log("[2/5] generating shorts pack (LLM)...");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const llmModel = String(process.env.OPENAI_MODEL || "gpt-5.4").trim() || "gpt-5.4";

  async function generateLLM({ input, max_output_tokens, jsonSchema }) {
    const params = { model: llmModel, max_output_tokens: max_output_tokens || 65536, input };
    if (jsonSchema) {
      params.text = {
        format: { type: "json_schema", name: jsonSchema.name, schema: jsonSchema.schema, strict: true },
      };
    }
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), OPENAI_CALL_TIMEOUT_MS);
    try {
      const response = await client.responses.create(params, { signal: ac.signal });
      return { output_text: getOpenAiOutputText(response) };
    } finally {
      clearTimeout(timer);
    }
  }

  const generationResult = await generatePackFromSource({
    title: article.title || "뉴스 쇼츠",
    author: article.byline || article.siteName || "",
    category: "뉴스",
    packFormat: "shorts",
    sourceText: article.bodyText,
    llmProvider: "openai",
    generateLLM,
  });

  const idea = Array.isArray(generationResult.pack?.ideas) ? generationResult.pack.ideas[0] : null;
  const scenes = Array.isArray(idea?.short?.scenes) ? idea.short.scenes : [];
  if (!idea || scenes.length === 0) {
    throw new Error("Generator did not return a shorts idea with scenes.");
  }
  console.log(`      idea="${idea.title}"  scenes=${scenes.length}`);

  // 3. Match scenes to harvested photos ---------------------------------------
  console.log("[3/5] matching scenes to article photos...");
  const scenesWithMedia = matchScenesToMedia({ scenes, article });

  // 4. Download photos + TTS ---------------------------------------------------
  console.log("[4/5] downloading photos + synthesizing voice...");
  for (let i = 0; i < scenesWithMedia.length; i += 1) {
    const scene = scenesWithMedia[i];
    const mediaUrl = scene.media?.url;
    if (!mediaUrl) {
      console.warn(`      scene ${i + 1}: no photo url, skipping image (render will fail without one).`);
      continue;
    }
    try {
      const fileName = await downloadImage(mediaUrl, path.join(previewDir, `scene-${String(i + 1).padStart(2, "0")}`));
      scene.image = { ...(scene.image || {}), localPreviewFile: fileName };
    } catch (error) {
      console.warn(`      scene ${i + 1}: image download failed (${error.message}).`);
    }
  }

  const ttsConfig = resolveGeminiTextToSpeechConfig({
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_TTS_MODEL,
    voiceName: process.env.GEMINI_TTS_VOICE,
  });
  if (!ttsConfig) throw new Error("GEMINI_API_KEY is required for TTS.");

  const ttsScenes = scenesWithMedia.map((scene, i) => ({
    id: scene?.id || `${idea.id}-scene-${i + 1}`,
    order: Number(scene?.order || i + 1) || i + 1,
    narration: String(scene?.narration || scene?.body || "").trim(),
  }));
  const audio = await synthesizeShortAudio({
    config: ttsConfig,
    scenes: ttsScenes,
    languageCode: generationResult.pack.languageCode,
  });
  const audioFileName = `${sanitize(idea.title, "idea")}.wav`;
  fs.writeFileSync(path.join(previewDir, audioFileName), Buffer.from(audio.audioBytes));

  // Assemble the preview-pack.json render-short-video.js expects ---------------
  const previewPack = {
    ...generationResult.pack,
    ideas: [
      {
        ...idea,
        short: {
          ...(idea.short || {}),
          scenes: scenesWithMedia,
          tts: {
            ...(idea.short?.tts || {}),
            provider: "gemini-tts",
            model: audio.model,
            voice: audio.voiceLabel,
            audioStatus: "ready",
            durationMs: audio.durationMs,
            segments: audio.segments,
            localAudioFile: audioFileName,
          },
        },
      },
    ],
  };
  fs.writeFileSync(
    path.join(previewDir, "preview-pack.json"),
    `${JSON.stringify(previewPack, null, 2)}\n`,
    "utf8"
  );

  // 5. Render ------------------------------------------------------------------
  console.log("[5/5] rendering mp4...");
  const outputPath = path.join(previewDir, "shorts.mp4");
  const render = spawnSync(
    process.execPath,
    [path.join(projectRoot, "scripts", "render-short-video.js"), previewDir, outputPath],
    { encoding: "utf8" }
  );
  if (render.status !== 0) {
    throw new Error(`render failed:\n${render.stderr || render.stdout}`);
  }

  console.log("\n✅ Done");
  console.log(`   video : ${path.relative(projectRoot, outputPath)}`);
  console.log(`   source: ${article.sourceUrl}  (ⓒ ${article.siteName})`);
}

main().catch((error) => {
  console.error("\n❌", error && error.stack ? error.stack : error);
  process.exit(1);
});
