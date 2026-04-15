const crypto = require("crypto");

const { LLM_PROVIDER } = require("../config/generation");
const { generateLLM } = require("./llm");
const {
  assessExtractedTextQuality,
  extractSourceTextFromUpload,
  isExtractedTextMeaningful,
  isImageUpload,
  isSupportedUpload,
} = require("./sourceExtraction");

const { generatePackFromSource, detectSourceLanguage } = require("../../shared/backend-core/dist/cjs/generation");
const { createSignedShortAudioUrl, enrichShortsPackWithAudio } = require("../../shared/backend-core/dist/cjs/shortsMedia");
const { normalizeSourceMaterialText, trimText } = require("../../shared/backend-core/dist/cjs/text");

function applyPatch(job, patch) {
  Object.entries(patch).forEach(([key, value]) => {
    if (typeof value !== "undefined") {
      job[key] = value;
    }
  });
}

function createGenerationHandlers({ jobStore }) {
  async function handleGeneratePack(request, response) {
    const title = trimText(request.body?.title, "");
    const author = trimText(request.body?.author, "");
    const category = trimText(request.body?.category, "");
    const packFormat = trimText(request.body?.packFormat, "shorts") === "cards" ? "cards" : "shorts";

    let sourceText = normalizeSourceMaterialText(request.body?.sourceText);
    let geminiFileBuffer = null;
    let geminiFileMimeType = null;

    const canFallbackToGeminiMultimodal =
      LLM_PROVIDER === "gemini" &&
      request.file &&
      isImageUpload(request.file);

    if (request.file) {
      if (!isSupportedUpload(request.file)) {
        response.status(400).json({
          error: "Unsupported file format. Upload PDF, DOCX, HWP, TXT, MD, CSV, JSON, HTML, XML, or RTF.",
        });
        return;
      }

      let extractedText = "";
      let extractionError = null;

      try {
        extractedText = await extractSourceTextFromUpload(request.file);
      } catch (error) {
        extractionError = error;
      }

      const hasMeaningfulExtractedText =
        extractedText && isExtractedTextMeaningful(extractedText) && assessExtractedTextQuality(extractedText).ok;

      if (hasMeaningfulExtractedText) {
        sourceText = extractedText;
      } else if (canFallbackToGeminiMultimodal) {
        geminiFileBuffer = request.file.buffer;
        geminiFileMimeType = request.file.mimetype || "application/octet-stream";
        sourceText = "[file attached for multimodal processing]";
        console.warn(
          `[gemini] Falling back to direct multimodal generation because text extraction was insufficient: ${
            extractionError?.message || "low-quality extracted text"
          }`
        );
      } else {
        response.status(400).json({
          error: "Could not extract enough readable text from the uploaded file.",
          details: extractionError?.message || "Extracted text was too short or garbled.",
        });
        return;
      }
    }

    if (!sourceText || !trimText(sourceText, "")) {
      response.status(400).json({
        error: request.file
          ? "The PDF did not contain extractable text. Please upload a text-based PDF."
          : "Please provide source text.",
      });
      return;
    }

    if (!geminiFileBuffer) {
      if (request.file && !isExtractedTextMeaningful(sourceText)) {
        response.status(400).json({
          error: "The uploaded file contained almost no readable text. It may be an image-based PDF that could not be processed. Please try a different file.",
        });
        return;
      }

      if (request.file) {
        const quality = assessExtractedTextQuality(sourceText);
        if (!quality.ok) {
          const message =
            quality.reason === "garbled"
              ? "파일에서 텍스트를 추출했지만 내용이 깨져서 읽을 수 없습니다. 텍스트 기반 PDF 또는 TXT 파일로 다시 시도해 주세요."
              : "파일에서 읽을 수 있는 텍스트가 없습니다. 다른 파일로 시도해 주세요.";
          response.status(400).json({ error: message });
          return;
        }
      }
    }

    const jobId = crypto.randomUUID();
    const job = await jobStore.create(jobId);
    response.json({ jobId });

    (async () => {
      try {
        const result = await generatePackFromSource({
          title,
          author,
          category,
          packFormat,
          sourceText,
          geminiFileBuffer,
          geminiFileMimeType,
          llmProvider: LLM_PROVIDER,
          generateLLM,
          onProgress: async (patch) => applyPatch(job, patch),
        });

        const packWithAudio = await enrichShortsPackWithAudio({
          pack: result.pack,
          ttsConfig: {
            apiKey: process.env.GEMINI_API_KEY,
            model: process.env.GEMINI_TTS_MODEL,
            voiceName: process.env.GEMINI_TTS_VOICE,
          },
          imageConfig: {
            apiKey: process.env.GEMINI_API_KEY,
            model: process.env.GEMINI_IMAGE_MODEL,
          },
          storageConfig: {
            supabaseUrl: process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL,
            serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
            bucketName: process.env.SUPABASE_AUDIO_BUCKET || "shorts-audio",
          },
          generateSceneImages: process.env.SHORTS_GENERATE_IMAGES === "1",
          onProgress: async (patch) => applyPatch(job, patch),
        });

        job.status = "done";
        job.pack = packWithAudio;
        job.debug = result.debug;
        jobStore.scheduleCleanup(jobId);
      } catch (error) {
        console.error("Generation failed:", error);
        job.status = "error";
        job.error = error.message || "Failed to generate a pack from the source.";
        jobStore.scheduleCleanup(jobId);
      }
    })();
  }

  async function handleGetJobStatus(request, response) {
    const job = await jobStore.get(request.params.jobId);
    if (!job) {
      response.status(404).json({ error: "Job not found or expired." });
      return;
    }

    const debug = job.debug || null;

    if (job.status === "done") {
      await jobStore.remove(request.params.jobId);
      response.json({ status: "done", pack: job.pack, debug });
      return;
    }

    if (job.status === "error") {
      await jobStore.remove(request.params.jobId);
      response.json({ status: "error", error: job.error, debug });
      return;
    }

    response.json({
      status: "working",
      step: job.step,
      totalChunks: job.totalChunks,
      completedChunks: job.completedChunks,
      debug,
    });
  }

  async function handleSignMediaUrl(request, response) {
    const path = trimText(request.body?.path, "");
    const bucketName = trimText(request.body?.bucketName, process.env.SUPABASE_AUDIO_BUCKET || "shorts-audio");
    const expiresIn = Math.max(60, Math.min(60 * 60 * 24, Number(request.body?.expiresIn || 60 * 60)));

    if (!path) {
      response.status(400).json({ error: "A storage path is required." });
      return;
    }

    try {
      const signed = await createSignedShortAudioUrl({
        path,
        bucketName,
        expiresIn,
        storageConfig: {
          supabaseUrl: process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL,
          serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          bucketName,
        },
      });

      response.json(signed);
    } catch (error) {
      response.status(500).json({ error: error.message || "Failed to create a signed media URL." });
    }
  }

  return {
    handleGeneratePack,
    handleGetJobStatus,
    handleSignMediaUrl,
  };
}

module.exports = {
  createGenerationHandlers,
  detectSourceLanguage,
};
