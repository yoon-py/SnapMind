#!/usr/bin/env node

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { performance } = require("perf_hooks");

const OpenAI = require("openai");
const { PDFParse } = require("pdf-parse");

const { extractSourceTextFromUpload } = require("../server/lib/sourceExtraction");
const { generatePackFromSource } = require("../shared/backend-core/dist/cjs/generation");
const {
  resolveGeminiTextToSpeechConfig,
  synthesizeShortAudio,
} = require("../shared/backend-core/dist/cjs/geminiTextToSpeech");

const OPENAI_PRICING = {
  inputPerMillion: 2.5,
  cachedInputPerMillion: 0.25,
  outputPerMillion: 15,
};

const GEMINI_TTS_PRICING = {
  inputTextPerMillion: 1,
  outputAudioPerMillion: 20,
};

const GOOGLE_DOCUMENT_AI_OCR_PRICING = {
  perThousandPages: 1.5,
};

const OPENAI_CALL_TIMEOUT_MS = 120000;

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function sanitizeFileSegment(value, fallback = "item") {
  const cleaned = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || fallback;
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(filePath, value) {
  fs.writeFileSync(filePath, String(value || ""), "utf8");
}

function createPdfFromTextSource({ sourceTextPath, textPdfPath, ocrPdfPath }) {
  const textPdf = spawnSync("cupsfilter", ["-m", "application/pdf", sourceTextPath], {
    encoding: null,
  });

  if (textPdf.status !== 0 || !textPdf.stdout || textPdf.stdout.length === 0) {
    throw new Error(`cupsfilter failed: ${String(textPdf.stderr || "").trim() || "unknown error"}`);
  }

  fs.writeFileSync(textPdfPath, textPdf.stdout);

  const ppmPrefix = ocrPdfPath.replace(/\.pdf$/i, "");
  const render = spawnSync("pdftoppm", ["-png", textPdfPath, ppmPrefix], {
    encoding: "utf8",
  });

  if (render.status !== 0) {
    throw new Error(`pdftoppm failed: ${render.stderr || "unknown error"}`);
  }

  const imagePath = `${ppmPrefix}-1.png`;
  if (!fs.existsSync(imagePath)) {
    throw new Error("pdftoppm did not create the expected PNG page.");
  }

  const rasterize = spawnSync("sips", ["-s", "format", "pdf", imagePath, "--out", ocrPdfPath], {
    encoding: "utf8",
  });

  if (rasterize.status !== 0 || !fs.existsSync(ocrPdfPath)) {
    throw new Error(`sips failed: ${rasterize.stderr || "unknown error"}`);
  }

  return {
    imagePath,
  };
}

async function getPdfPageCount(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return Number(result.total || 1) || 1;
  } finally {
    await parser.destroy().catch(() => {});
  }
}

function getOpenAiOutputText(response) {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }

  const output = Array.isArray(response.output) ? response.output : [];
  const textParts = [];

  for (const item of output) {
    const contents = Array.isArray(item?.content) ? item.content : [];
    for (const content of contents) {
      if (typeof content?.text === "string") {
        textParts.push(content.text);
      }
    }
  }

  return textParts.join("\n").trim();
}

function toNumber(value) {
  return Number(value || 0) || 0;
}

function sumBy(items, getter) {
  return items.reduce((sum, item) => sum + toNumber(getter(item)), 0);
}

function buildMarkdownReport({
  metrics,
  pack,
  outputFiles,
}) {
  const lines = [
    "# Shorts E2E Report",
    "",
    `- LLM model: ${metrics.llm.model}`,
    `- OCR provider: ${metrics.ocr.provider}`,
    `- TTS model: ${metrics.tts.model || "not used"}`,
    `- Source PDF pages: ${metrics.ocr.pages}`,
    `- OCR text length: ${metrics.ocr.textLength} chars`,
    "",
    "## Time",
    "",
    `- PDF build: ${metrics.timings.pdfBuildMs} ms`,
    `- OCR: ${metrics.timings.ocrMs} ms`,
    `- Shorts generation: ${metrics.timings.generationMs} ms`,
    `- TTS: ${metrics.timings.ttsMs} ms`,
    `- Total: ${metrics.timings.totalMs} ms`,
    "",
    "## Cost",
    "",
    `- OCR: $${metrics.costs.ocr.usd.toFixed(6)}`,
    `- LLM: $${metrics.costs.llm.usd.toFixed(6)}`,
    `- TTS: $${metrics.costs.tts.usd.toFixed(6)}`,
    `- Total: $${metrics.costs.total.usd.toFixed(6)}`,
    "",
    "## Output Files",
    "",
    ...outputFiles.map((file) => `- ${file}`),
    "",
    "## Idea Summary",
    "",
  ];

  for (const idea of Array.isArray(pack?.ideas) ? pack.ideas : []) {
    const scenes = Array.isArray(idea?.short?.scenes) ? idea.short.scenes : [];
    const quizQuestions = Array.isArray(idea?.quiz?.questions) ? idea.quiz.questions : [];
    lines.push(`### ${idea.title || idea.id}`);
    lines.push("");
    lines.push(`- Section: ${idea.section || ""}`);
    lines.push(`- Duration: ${idea.durationSec || 0}s`);
    lines.push(`- Scenes: ${scenes.length}`);
    lines.push(`- Quiz questions: ${quizQuestions.length}`);
    if (idea.short?.tts?.localAudioFile) {
      lines.push(`- Audio: ${idea.short.tts.localAudioFile}`);
    }
    lines.push("");
    for (const scene of scenes) {
      lines.push(`- Scene ${scene.order}: ${scene.headline}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const projectRoot = path.resolve(__dirname, "..");
  const sourceTextPath = path.join(projectRoot, "artifacts", "shorts-e2e", "source-notes.txt");
  const runStamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const outputDir = path.join(projectRoot, "artifacts", "shorts-e2e", `run-${runStamp}`);
  ensureDir(outputDir);

  const textPdfPath = path.join(outputDir, "sample-source-text.pdf");
  const ocrPdfPath = path.join(outputDir, "sample-source-ocr.pdf");
  const ocrTextPath = path.join(outputDir, "sample-source-ocr.txt");
  const packJsonPath = path.join(outputDir, "sample-shorts-pack.json");
  const metricsJsonPath = path.join(outputDir, "sample-shorts-metrics.json");
  const reportMdPath = path.join(outputDir, "sample-shorts-report.md");

  const timings = {
    pdfBuildMs: 0,
    ocrMs: 0,
    generationMs: 0,
    ttsMs: 0,
    totalMs: 0,
  };

  const totalStartedAt = performance.now();

  const pdfBuildStartedAt = performance.now();
  const { imagePath } = createPdfFromTextSource({
    sourceTextPath,
    textPdfPath,
    ocrPdfPath,
  });
  timings.pdfBuildMs = Math.round(performance.now() - pdfBuildStartedAt);

  const pdfBuffer = fs.readFileSync(ocrPdfPath);
  const pdfPages = await getPdfPageCount(pdfBuffer);

  const ocrStartedAt = performance.now();
  const ocrText = await extractSourceTextFromUpload({
    originalname: path.basename(ocrPdfPath),
    mimetype: "application/pdf",
    size: pdfBuffer.length,
    buffer: pdfBuffer,
  });
  timings.ocrMs = Math.round(performance.now() - ocrStartedAt);
  writeText(ocrTextPath, ocrText);

  const llmCalls = [];
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const llmModel = String(process.env.OPENAI_MODEL || "gpt-5.4").trim() || "gpt-5.4";

  async function meteredGenerateLLM({ input, max_output_tokens, jsonSchema }) {
    const startedAt = performance.now();
    console.log(
      `[LLM] start ${jsonSchema?.name || "text"} max_output_tokens=${max_output_tokens || 65536}`
    );
    const params = {
      model: llmModel,
      max_output_tokens: max_output_tokens || 65536,
      input,
    };

    if (jsonSchema) {
      params.text = {
        format: {
          type: "json_schema",
          name: jsonSchema.name,
          schema: jsonSchema.schema,
          strict: true,
        },
      };
    }

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), OPENAI_CALL_TIMEOUT_MS);
    const response = await client.responses.create(params, { signal: abortController.signal });
    clearTimeout(timeout);
    const outputText = getOpenAiOutputText(response);
    console.log(
      `[LLM] done ${jsonSchema?.name || "text"} in ${Math.round(
        performance.now() - startedAt
      )}ms outputChars=${outputText.length}`
    );
    llmCalls.push({
      schemaName: jsonSchema?.name || null,
      elapsedMs: Math.round(performance.now() - startedAt),
      usage: response.usage || null,
      outputChars: outputText.length,
      responseId: response.id || null,
    });

    return { output_text: outputText };
  }

  const generationStartedAt = performance.now();
  const generationResult = await generatePackFromSource({
    title: "데이터의 언어: 벡터와 행렬",
    author: "Codex Sample",
    category: "수학 / 머신러닝",
    packFormat: "shorts",
    sourceText: ocrText,
    llmProvider: "openai",
    generateLLM: meteredGenerateLLM,
  });
  timings.generationMs = Math.round(performance.now() - generationStartedAt);

  const ttsCalls = [];
  const ttsConfig = resolveGeminiTextToSpeechConfig({
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_TTS_MODEL,
    voiceName: process.env.GEMINI_TTS_VOICE,
  });

  let packWithAudio = generationResult.pack;

  if (ttsConfig) {
    const ttsStartedAt = performance.now();
    const updatedIdeas = [];

    for (let index = 0; index < (packWithAudio.ideas || []).length; index += 1) {
      const idea = packWithAudio.ideas[index];
      const scenes = Array.isArray(idea?.short?.scenes)
        ? idea.short.scenes.map((scene, sceneIndex) => ({
            id: scene?.id || `${idea.id}-scene-${sceneIndex + 1}`,
            order: Number(scene?.order || sceneIndex + 1) || sceneIndex + 1,
            narration: String(scene?.narration || scene?.body || "").trim(),
          }))
        : [];

      let usageMetadata = null;
      const ttsStartedAtPerIdea = performance.now();
      try {
        console.log(`[TTS] start ${idea.title}`);
        let audio = null;
        let lastError = null;

        for (let attempt = 1; attempt <= 2; attempt += 1) {
          try {
            usageMetadata = null;
            audio = await synthesizeShortAudio({
              config: ttsConfig,
              scenes,
              languageCode: packWithAudio.languageCode,
              fetchImpl: async (...args) => {
                const response = await fetch(...args);
                try {
                  const cloned = await response.clone().json();
                  usageMetadata = cloned?.usageMetadata || null;
                } catch (_) {}
                return response;
              },
            });
            break;
          } catch (error) {
            lastError = error;
            if (attempt < 2) {
              await sleep(2000);
            }
          }
        }

        if (!audio) {
          throw lastError || new Error("Gemini TTS did not return audio.");
        }

        const audioFileName = `${String(index + 1).padStart(2, "0")}-${sanitizeFileSegment(
          idea.title,
          `idea-${index + 1}`
        )}.wav`;
        const localAudioPath = path.join(outputDir, audioFileName);
        fs.writeFileSync(localAudioPath, Buffer.from(audio.audioBytes));

        ttsCalls.push({
          ideaId: idea.id,
          title: idea.title,
          elapsedMs: Math.round(performance.now() - ttsStartedAtPerIdea),
          durationMs: audio.durationMs,
          usageMetadata,
          localAudioFile: audioFileName,
          model: audio.model,
          voice: audio.voiceLabel,
          audioStatus: "ready",
        });
        console.log(
          `[TTS] done ${idea.title} in ${Math.round(performance.now() - ttsStartedAtPerIdea)}ms`
        );

        updatedIdeas.push({
          ...idea,
          short: {
            ...(idea.short || {}),
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
        });
      } catch (error) {
        console.warn(`[TTS] failed ${idea.title}: ${error?.message || error}`);
        ttsCalls.push({
          ideaId: idea.id,
          title: idea.title,
          elapsedMs: Math.round(performance.now() - ttsStartedAtPerIdea),
          durationMs: 0,
          usageMetadata,
          localAudioFile: null,
          model: ttsConfig.model,
          voice: ttsConfig.voiceName,
          audioStatus: "failed",
          errorMessage: error?.message || "Failed to synthesize audio.",
        });

        updatedIdeas.push({
          ...idea,
          short: {
            ...(idea.short || {}),
            tts: {
              ...(idea.short?.tts || {}),
              provider: "gemini-tts",
              model: ttsConfig.model,
              voice: ttsConfig.voiceName,
              audioStatus: "failed",
              durationMs: 0,
              localAudioFile: null,
              errorMessage: error?.message || "Failed to synthesize audio.",
            },
          },
        });
      }
    }

    timings.ttsMs = Math.round(performance.now() - ttsStartedAt);
    packWithAudio = {
      ...packWithAudio,
      ideas: updatedIdeas,
    };
  }

  timings.totalMs = Math.round(performance.now() - totalStartedAt);

  const llmInputTokens = sumBy(llmCalls, (call) => call.usage?.input_tokens);
  const llmCachedInputTokens = sumBy(llmCalls, (call) => call.usage?.input_tokens_details?.cached_tokens);
  const llmOutputTokens = sumBy(llmCalls, (call) => call.usage?.output_tokens);

  const llmCost =
    (llmInputTokens / 1_000_000) * OPENAI_PRICING.inputPerMillion +
    (llmCachedInputTokens / 1_000_000) * OPENAI_PRICING.cachedInputPerMillion +
    (llmOutputTokens / 1_000_000) * OPENAI_PRICING.outputPerMillion;

  const ttsInputTokens = sumBy(ttsCalls, (call) => call.usageMetadata?.promptTokenCount);
  const ttsOutputTokens = sumBy(ttsCalls, (call) => call.usageMetadata?.candidatesTokenCount);
  const ttsCost =
    (ttsInputTokens / 1_000_000) * GEMINI_TTS_PRICING.inputTextPerMillion +
    (ttsOutputTokens / 1_000_000) * GEMINI_TTS_PRICING.outputAudioPerMillion;

  const ocrCost = (pdfPages / 1000) * GOOGLE_DOCUMENT_AI_OCR_PRICING.perThousandPages;

  const metrics = {
    generatedAt: new Date().toISOString(),
    source: {
      sourceTextPath: path.relative(projectRoot, sourceTextPath),
      textPdfPath: path.relative(projectRoot, textPdfPath),
      rasterImagePath: path.relative(projectRoot, imagePath),
      ocrPdfPath: path.relative(projectRoot, ocrPdfPath),
    },
    timings,
    ocr: {
      provider: "google_document_ai",
      pages: pdfPages,
      textLength: ocrText.length,
      costFormula: `${pdfPages} pages x $${GOOGLE_DOCUMENT_AI_OCR_PRICING.perThousandPages.toFixed(
        2
      )} / 1000 pages`,
    },
    llm: {
      provider: "openai",
      model: llmModel,
      calls: llmCalls,
      totalInputTokens: llmInputTokens,
      totalCachedInputTokens: llmCachedInputTokens,
      totalOutputTokens: llmOutputTokens,
      pricing: OPENAI_PRICING,
    },
    tts: {
      provider: ttsConfig ? "gemini-tts" : "not-configured",
      model: ttsConfig?.model || null,
      voice: ttsConfig?.voiceName || null,
      calls: ttsCalls,
      totalInputTokens: ttsInputTokens,
      totalOutputTokens: ttsOutputTokens,
      pricing: GEMINI_TTS_PRICING,
    },
    costs: {
      ocr: { usd: Number(ocrCost.toFixed(6)) },
      llm: { usd: Number(llmCost.toFixed(6)) },
      tts: { usd: Number(ttsCost.toFixed(6)) },
      total: { usd: Number((ocrCost + llmCost + ttsCost).toFixed(6)) },
      assumptions: [
        "OpenAI cost uses GPT-5.4 standard pricing with uncached input and output tokens.",
        "Gemini TTS cost uses Gemini 2.5 Pro Preview TTS standard pricing with text input tokens and audio output tokens.",
        "Google OCR cost uses Document AI Enterprise Document OCR Processor standard pricing per PDF page.",
        "Free tiers, taxes, regional adjustments, and storage bandwidth are excluded.",
      ],
    },
  };

  const outputFiles = [
    path.relative(projectRoot, sourceTextPath),
    path.relative(projectRoot, textPdfPath),
    path.relative(projectRoot, imagePath),
    path.relative(projectRoot, ocrPdfPath),
    path.relative(projectRoot, ocrTextPath),
    path.relative(projectRoot, packJsonPath),
    path.relative(projectRoot, metricsJsonPath),
    path.relative(projectRoot, reportMdPath),
    ...ttsCalls.map((call) => path.relative(projectRoot, path.join(outputDir, call.localAudioFile))),
  ];

  writeJson(packJsonPath, packWithAudio);
  writeJson(metricsJsonPath, metrics);
  writeText(
    reportMdPath,
    buildMarkdownReport({
      metrics,
      pack: packWithAudio,
      outputFiles,
    })
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        outputDir: path.relative(projectRoot, outputDir),
        files: outputFiles,
        timings,
        totalCostUsd: metrics.costs.total.usd,
        ideas: Array.isArray(packWithAudio.ideas) ? packWithAudio.ideas.length : 0,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
