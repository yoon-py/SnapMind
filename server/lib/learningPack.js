const crypto = require("crypto");

const {
  GEMINI_API_KEY,
  LLM_PROVIDER,
  MEDIA_PROVIDER,
  OPENAI_API_KEY,
  OPENAI_IMAGE_MODEL,
  OPENAI_TTS_MODEL,
  OPENAI_TTS_VOICE,
} = require("../config/generation");
const { generateLLM } = require("./llm");
const { getUserFromAuthHeader, sendGenerationNotification } = require("./pushNotifications");
const {
  assessExtractedTextQuality,
  extractSourceTextFromUpload,
  isExtractedTextMeaningful,
  isImageUpload,
  isSupportedUpload,
} = require("./sourceExtraction");

const { generatePackFromSource, detectSourceLanguage } = require("../../shared/backend-core/dist/cjs/generation");
const { enrichDeckPackWithImages } = require("../../shared/backend-core/dist/cjs/deckMedia");
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
    const requestedFormat = trimText(request.body?.packFormat, "shorts");
    const requestedExtractionMode = trimText(request.body?.extractionMode, "auto");
    const extractionMode = ["auto", "pdf-parser", "upstage-ocr"].includes(requestedExtractionMode)
      ? requestedExtractionMode
      : "auto";
    const skipMedia = String(request.body?.skipMedia || "").trim() === "1";
    const packFormat = ["cards", "shorts", "deck"].includes(requestedFormat) ? requestedFormat : "shorts";
    const notificationUser = await getUserFromAuthHeader(request).catch(() => null);
    const notificationUserId = notificationUser?.id || null;

    if (request.file) {
      if (!isSupportedUpload(request.file)) {
        response.status(400).json({
          error: "Unsupported file format. Upload PDF, DOCX, HWP, TXT, MD, CSV, JSON, HTML, XML, or RTF.",
        });
        return;
      }
    } else if (!normalizeSourceMaterialText(request.body?.sourceText)) {
      response.status(400).json({
        error: "Please provide source text.",
      });
      return;
    }

    const jobId = crypto.randomUUID();
    const job = await jobStore.create(jobId);
    response.json({ jobId });

    (async () => {
      try {
        let sourceText = normalizeSourceMaterialText(request.body?.sourceText);
        let geminiFileBuffer = null;
        let geminiFileMimeType = null;

        const canFallbackToModelFileInput =
          ["gemini", "openai"].includes(LLM_PROVIDER) &&
          request.file &&
          extractionMode === "auto";

        if (request.file) {
          await applyPatch(job, { step: "extracting text", totalChunks: 1, completedChunks: 0 });

          let extractedText = "";
          let extractionError = null;

          try {
            extractedText = await extractSourceTextFromUpload(request.file, { extractionMode });
          } catch (error) {
            extractionError = error;
          }

          const hasMeaningfulExtractedText =
            extractedText && isExtractedTextMeaningful(extractedText) && assessExtractedTextQuality(extractedText).ok;

          if (hasMeaningfulExtractedText) {
            sourceText = extractedText;
          } else if (canFallbackToModelFileInput) {
            geminiFileBuffer = request.file.buffer;
            geminiFileMimeType = request.file.mimetype || "application/octet-stream";
            sourceText = "[file attached for multimodal processing]";
            console.warn(
              `[${LLM_PROVIDER}] Falling back to direct file input because text extraction was insufficient: ${
                extractionError?.message || "low-quality extracted text"
              }`
            );
          } else {
            throw new Error(
              extractionError?.message ||
                "이미지 기반 PDF(스캔본)는 텍스트 추출이 불가합니다. UPSTAGE_API_KEY 또는 Google Document AI OCR 설정을 확인해 주세요."
            );
          }

          await applyPatch(job, { completedChunks: 1 });
        }

        if (!sourceText || !trimText(sourceText, "")) {
          throw new Error(
            request.file
              ? "The uploaded file did not contain extractable text."
              : "Please provide source text."
          );
        }

        if (!geminiFileBuffer) {
          if (request.file && !isExtractedTextMeaningful(sourceText)) {
            throw new Error(
              "The uploaded file contained almost no readable text. It may be an image-based PDF that could not be processed. Please try a different file."
            );
          }

          if (request.file) {
            const quality = assessExtractedTextQuality(sourceText);
            if (!quality.ok) {
              throw new Error(
                quality.reason === "garbled"
                  ? "파일에서 텍스트를 추출했지만 내용이 깨져서 읽을 수 없습니다. 텍스트 기반 PDF 또는 TXT 파일로 다시 시도해 주세요."
                  : "파일에서 읽을 수 있는 텍스트가 없습니다. 다른 파일로 시도해 주세요."
              );
            }
          }
        }

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

        if (skipMedia) {
          job.status = "done";
          job.pack = result.pack;
          job.debug = result.debug;
          await sendGenerationNotification({
            userId: notificationUserId,
            title: "SnapMind",
            body: `"${result.pack?.title || title || "학습팩"}" 생성이 끝났어요.`,
            data: { type: "generation_done", jobId, packId: result.pack?.id || null },
          }).catch((error) => console.warn("Push notification failed:", error?.message || error));
          jobStore.scheduleCleanup(jobId);
          return;
        }

        const packWithAudio = await enrichShortsPackWithAudio({
          pack: result.pack,
          ttsConfig: {
            provider: MEDIA_PROVIDER,
            apiKey: MEDIA_PROVIDER === "openai" ? OPENAI_API_KEY : GEMINI_API_KEY,
            model: MEDIA_PROVIDER === "openai" ? OPENAI_TTS_MODEL : process.env.GEMINI_TTS_MODEL,
            voiceName: MEDIA_PROVIDER === "openai" ? OPENAI_TTS_VOICE : process.env.GEMINI_TTS_VOICE,
          },
          imageConfig: {
            provider: "openai",
            apiKey: OPENAI_API_KEY,
            model: OPENAI_IMAGE_MODEL,
            size: process.env.OPENAI_IMAGE_SIZE || "1024x1792",
            quality: process.env.OPENAI_IMAGE_QUALITY || "low",
          },
          storageConfig: {
            supabaseUrl: process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL,
            serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
            bucketName: process.env.SUPABASE_AUDIO_BUCKET || "shorts-audio",
          },
          generateSceneImages: process.env.SHORTS_GENERATE_IMAGES === "1",
          onProgress: async (patch) => applyPatch(job, patch),
        });

        const packWithMedia = await enrichDeckPackWithImages({
          pack: packWithAudio,
          imageConfig: {
            provider: MEDIA_PROVIDER,
            apiKey: MEDIA_PROVIDER === "openai" ? OPENAI_API_KEY : GEMINI_API_KEY,
            model: MEDIA_PROVIDER === "openai" ? OPENAI_IMAGE_MODEL : process.env.GEMINI_IMAGE_MODEL,
            size: "1536x1024",
            quality: process.env.OPENAI_IMAGE_QUALITY || "low",
          },
          storageConfig: {
            supabaseUrl: process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL,
            serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
            bucketName:
              process.env.SUPABASE_IMAGE_BUCKET ||
              process.env.SUPABASE_AUDIO_BUCKET ||
              "shorts-audio",
          },
          generateDeckImages: process.env.DECK_GENERATE_IMAGES === "1",
          onProgress: async (patch) => applyPatch(job, patch),
        });

        job.status = "done";
        job.pack = packWithMedia;
        job.debug = result.debug;
        await sendGenerationNotification({
          userId: notificationUserId,
          title: "SnapMind",
          body: `"${packWithMedia?.title || title || "학습팩"}" 생성이 끝났어요.`,
          data: { type: "generation_done", jobId, packId: packWithMedia?.id || null },
        }).catch((error) => console.warn("Push notification failed:", error?.message || error));
        jobStore.scheduleCleanup(jobId);
      } catch (error) {
        console.error("Generation failed:", error);
        job.status = "error";
        job.error = error.message || "Failed to generate a pack from the source.";
        await sendGenerationNotification({
          userId: notificationUserId,
          title: "SnapMind",
          body: "학습팩 생성에 실패했어요. 앱에서 다시 시도해 주세요.",
          data: { type: "generation_error", jobId },
        }).catch((pushError) => console.warn("Push notification failed:", pushError?.message || pushError));
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
