const cors = require("cors");
const dotenv = require("dotenv");
const express = require("express");
const path = require("path");

dotenv.config();

const {
  GEMINI_MODEL,
  LLM_PROVIDER,
  OPENAI_API_KEY,
  OPENAI_IMAGE_MODEL,
  host,
  model,
  port,
  upload,
} = require("./config/generation");
const { createGenerationHandlers } = require("./lib/learningPack");
const { generateLLM } = require("./lib/llm");
const { createIdeaChatHandler } = require("./lib/ideaChat");
// 웹 /api/generate-scenes·quiz 와 백엔드 숏츠 brain 이 공유하는 프롬프트/스키마 (단일 소스)
const {
  SCENES_JSON_SCHEMA,
  QUIZ_JSON_SCHEMA,
  buildScenesInput,
  buildSceneQuizPrompt,
  normalizeGeneratedScenesPayload: normalizeScenesShared,
} = require("../shared/backend-core/dist/cjs/scenesPrompt");

// Strip ```json fences and grab the JSON object if the model wraps it.
function parseJsonLoose(raw) {
  let s = String(raw || "").trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start > 0 || end < s.length - 1) s = s.slice(start, end + 1);
  return JSON.parse(s);
}
const { extractSourceTextFromUpload } = require("./lib/sourceExtraction");
const { getUserFromAuthHeader, upsertPushToken } = require("./lib/pushNotifications");
const { createAuthRouter } = require("./routes/auth");
const { createAuthSessionStore } = require("./stores/authSessionStore");
const { createJobStore } = require("./stores/jobStore");

const IMAGE_PROVIDER = String(process.env.IMAGE_PROVIDER || "hybrid").toLowerCase();
const OPENAI_IMAGE_SIZE = process.env.OPENAI_IMAGE_SIZE || "1024x1792";
const OPENAI_IMAGE_QUALITY = process.env.OPENAI_IMAGE_QUALITY || "low";
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";
const GEMINI_PRO_IMAGE_MODEL = process.env.GEMINI_PRO_IMAGE_MODEL || "gemini-3-pro-image";
const IMAGE_OCR_REVIEW = process.env.IMAGE_OCR_REVIEW !== "0";
const IMAGE_OCR_MODEL = process.env.IMAGE_OCR_MODEL || process.env.OPENAI_MODEL || "gpt-5.4";
const GEMINI_API_KEY_MISSING_MESSAGE =
  "Gemini API key가 없습니다. `.env`에 `GEMINI_API_KEY`를 설정해 주세요.";

function getModelComboInfo() {
  const llmLabel = String(model || "gpt-5.4").replace(/^gpt-/i, "GPT");
  const imageProvider = String(IMAGE_PROVIDER || "hybrid").toLowerCase();
  const openAiImageLabel = `${OPENAI_IMAGE_MODEL || "gpt-image-2"} ${OPENAI_IMAGE_QUALITY || "low"}`
    .replace(/^gpt-image-2/i, "GPT Image 2");
  const geminiProLabel = "Nano Banana Pro";
  const geminiFlashLabel = GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";
  const ocrLabel = IMAGE_OCR_REVIEW ? "OCR" : "";

  const imageLabel = imageProvider === "hybrid"
    ? `${openAiImageLabel} + ${geminiProLabel}`
    : imageProvider === "openai"
      ? openAiImageLabel
      : imageProvider === "gemini" || imageProvider === "gemini-flash"
        ? geminiFlashLabel
        : imageProvider === "gemini-pro" || imageProvider === "nano-banana-pro"
          ? geminiProLabel
          : imageProvider;

  const label = [llmLabel, imageLabel, ocrLabel].filter(Boolean).join(" + ");

  return {
    label,
    llmProvider: LLM_PROVIDER,
    llmModel: model,
    imageProvider,
    openaiImageModel: OPENAI_IMAGE_MODEL,
    openaiImageQuality: OPENAI_IMAGE_QUALITY,
    openaiImageSize: OPENAI_IMAGE_SIZE,
    geminiImageModel: GEMINI_IMAGE_MODEL,
    geminiProImageModel: GEMINI_PRO_IMAGE_MODEL,
    imageOcrReview: IMAGE_OCR_REVIEW,
    imageOcrModel: IMAGE_OCR_MODEL,
  };
}

function compactText(value, fallback = "") {
  return String(value || fallback).replace(/\s+/g, " ").trim();
}

function clampRatio(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(0.98, number));
}

function getImageCandidateFromGemini(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const direct = value.output_image || value.outputImage;
  if (direct?.data) {
    return {
      b64: String(direct.data),
      mimeType: direct.mime_type || direct.mimeType || "image/png",
    };
  }

  if (value.data && /image\//i.test(String(value.mime_type || value.mimeType || ""))) {
    return {
      b64: String(value.data),
      mimeType: value.mime_type || value.mimeType || "image/png",
    };
  }

  if (value.inlineData?.data || value.inline_data?.data) {
    const inline = value.inlineData || value.inline_data;
    return {
      b64: String(inline.data),
      mimeType: inline.mimeType || inline.mime_type || "image/png",
    };
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = getImageCandidateFromGemini(item);
      if (found) return found;
    }
    return null;
  }

  for (const child of Object.values(value)) {
    const found = getImageCandidateFromGemini(child);
    if (found) return found;
  }

  return null;
}

function buildGeminiImagePrompt(prompt) {
  return [
    String(prompt || "").trim(),
    "",
    "Render this as a polished vertical 9:16 educational visual for the CURRENT narration beat, not a full unit poster, textbook cover, or decorative illustration.",
    "The image must help the viewer understand exactly what the TTS is explaining at this moment. Do not summarize the whole chapter unless the prompt explicitly asks for an overview.",
    "Prioritize conceptual accuracy over painterly style. If the current beat needs a graph, formula, matrix, architecture diagram, table, axis, layer model, or flow chart, make that structure crisp and readable.",
    "Short Korean labels, short Korean titles, mathematical notation, formulas, axis labels, legends, and concise callouts are allowed when they improve learning accuracy. Do not write long paragraphs inside the image.",
    "Keep Korean text short and proofread-looking. Avoid garbled pseudo text. If unsure, use symbols, arrows, numbers, formulas, and app-rendered text areas instead of long rendered text.",
    "Do not put a large headline, chapter name, subsection name, lesson title, or cover-style title at the top of the image. The app renders titles and controls separately.",
    "Do not render a table-of-contents screen, numbered bullet-card list, title page, lesson menu, app-generated fallback card layout, or any slide that is mostly text boxes.",
    "Use a clean modern learning-card style: precise spacing, high contrast, well-aligned panels, blueprint/diagram discipline when relevant, and enough white space for mobile readability.",
    "This must be RAW EDUCATIONAL ARTWORK only. It will be placed inside an existing app player, so never render the app player itself.",
    "Absolutely do not draw a complete phone screen, smartphone mockup, rounded phone viewport, device frame, browser chrome, notch, dynamic island, status bar, clock, battery, signal icons, speed buttons, progress bars, captions, subtitles, tab bars, chapter badges, app buttons, watermarks, logos, or fake UI.",
    "Fill the entire 9:16 canvas with artwork and background. Do not create letterboxing, white poster margins, framed slide borders, phone screenshots, or contain-style padding.",
    "Compose natively for a tall 9:16 raw artwork frame. Keep the top 18% visually quiet because the app overlays status/progress UI there, but still fill that area with natural background. Put core teaching content below that safe area.",
    "Every image should match the current narration beat and be meaningfully different from neighboring beats: change composition, objects, diagram structure, camera angle, or color emphasis when the idea changes.",
  ].join("\n");
}

function buildOpenAIImagePrompt(prompt) {
  return buildGeminiImagePrompt(prompt);
}

function createHttpError(message, status = 500, extras = {}) {
  const error = new Error(message);
  error.status = status;
  Object.assign(error, extras);
  return error;
}

function imageBytesToBase64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

function getFileExtensionFromMimeType(mimeType) {
  if (/webp/i.test(mimeType)) return "webp";
  if (/jpeg|jpg/i.test(mimeType)) return "jpg";
  return "png";
}

async function generateOpenAIImageCandidate(prompt) {
  if (!OPENAI_API_KEY) {
    throw createHttpError("OpenAI API key가 없습니다. `.env`에 `OPENAI_API_KEY`를 설정해 주세요.", 400, {
      code: "OPENAI_API_KEY_MISSING",
      provider: "openai",
      model: OPENAI_IMAGE_MODEL,
    });
  }

  const upstream = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_IMAGE_MODEL,
      prompt: buildOpenAIImagePrompt(prompt),
      size: OPENAI_IMAGE_SIZE,
      quality: OPENAI_IMAGE_QUALITY,
    }),
  });

  const data = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    throw createHttpError(data?.error?.message || data?.message || "OpenAI image generation failed.", upstream.status, {
      provider: "openai",
      model: OPENAI_IMAGE_MODEL,
    });
  }

  const firstImage = Array.isArray(data?.data) ? data.data[0] : null;
  const b64 = String(firstImage?.b64_json || "");
  if (b64) {
    return {
      b64,
      provider: "openai",
      model: OPENAI_IMAGE_MODEL,
      quality: OPENAI_IMAGE_QUALITY,
      mimeType: "image/png",
    };
  }

  const imageUrl = String(firstImage?.url || "");
  if (!imageUrl) {
    throw createHttpError("OpenAI image model did not return image bytes or a URL.", 502, {
      provider: "openai",
      model: OPENAI_IMAGE_MODEL,
    });
  }

  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw createHttpError(`OpenAI image download failed: ${imageResponse.statusText}`, imageResponse.status, {
      provider: "openai",
      model: OPENAI_IMAGE_MODEL,
    });
  }

  const mimeType = imageResponse.headers.get("content-type") || "image/png";
  const bytes = new Uint8Array(await imageResponse.arrayBuffer());
  return {
    b64: imageBytesToBase64(bytes),
    provider: "openai",
    model: OPENAI_IMAGE_MODEL,
    quality: OPENAI_IMAGE_QUALITY,
    mimeType,
    fileExtension: getFileExtensionFromMimeType(mimeType),
  };
}

async function generateGeminiImageCandidate(prompt, modelId = GEMINI_PRO_IMAGE_MODEL) {
  if (!process.env.GEMINI_API_KEY) {
    throw createHttpError(GEMINI_API_KEY_MISSING_MESSAGE, 400, {
      code: "GEMINI_API_KEY_MISSING",
      provider: "gemini",
      model: modelId,
    });
  }

  const upstream = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: {
      "x-goog-api-key": process.env.GEMINI_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelId,
      input: [{ type: "text", text: buildGeminiImagePrompt(prompt) }],
      response_format: {
        type: "image",
        mime_type: "image/png",
        aspect_ratio: "9:16",
        image_size: process.env.GEMINI_PRO_IMAGE_SIZE || process.env.GEMINI_IMAGE_SIZE || "1K",
      },
    }),
  });

  const data = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    throw createHttpError(data?.error?.message || data?.message || "Gemini image generation failed.", upstream.status, {
      provider: "gemini",
      model: modelId,
    });
  }

  const image = getImageCandidateFromGemini(data);
  if (!image?.b64) {
    throw createHttpError("Gemini image model did not return image bytes.", 502, {
      provider: "gemini",
      model: modelId,
    });
  }

  return {
    b64: image.b64,
    provider: "gemini",
    model: modelId,
    mimeType: image.mimeType || "image/png",
  };
}

function extractTextFromOpenAIResponse(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  const chunks = [];
  for (const output of Array.isArray(data?.output) ? data.output : []) {
    for (const content of Array.isArray(output?.content) ? output.content : []) {
      if (typeof content?.text === "string") chunks.push(content.text);
    }
  }
  return chunks.join("\n").trim();
}

function hasLongKoreanSentence(text) {
  const value = compactText(text, "");
  if (!/[가-힣]/.test(value)) return false;
  const hangulLength = (value.match(/[가-힣]/g) || []).length;
  const looksLikeSentence = /(합니다|입니다|됩니다|이에요|예요|해요|어요|아요|한다|된다|했다|하자|보자|요[.!?]?|다[.!?]?)$/.test(value);
  return hangulLength > 18 || looksLikeSentence;
}

function normalizeOcrReview(raw) {
  const extractedText = (Array.isArray(raw?.extractedText)
    ? raw.extractedText
    : String(raw?.extractedText || "")
        .split(/\n+/)
  )
    .map((item) => compactText(item, ""))
    .filter(Boolean)
    .slice(0, 30);

  const bannedPatterns = [
    /GPT\s*Image\s*2/i,
    /PDF\s*Parser/i,
    /시각\s*자료\s*준비/i,
    /학습\s*자료\s*준비/i,
    /직접\s*학습\s*만들기/i,
    /나노\s*바나나/i,
    /Gemini/i,
    /OpenAI/i,
  ];
  const bannedText = [
    ...(Array.isArray(raw?.bannedText) ? raw.bannedText : []),
    ...extractedText.filter((text) => bannedPatterns.some((pattern) => pattern.test(text))),
  ]
    .map((item) => compactText(item, ""))
    .filter(Boolean);
  const longKoreanText = extractedText.filter(hasLongKoreanSentence);
  const passes = !bannedText.length && !longKoreanText.length && raw?.passes !== false;

  return {
    status: "reviewed",
    passes,
    extractedText,
    bannedText: [...new Set(bannedText)].slice(0, 10),
    longKoreanText: longKoreanText.slice(0, 10),
    reason: compactText(raw?.reason, passes ? "OCR text check passed." : "OCR found image text that should be regenerated."),
  };
}

async function reviewImageTextWithOcr(image) {
  if (!IMAGE_OCR_REVIEW) {
    return { status: "disabled", passes: true, reason: "IMAGE_OCR_REVIEW=0" };
  }
  if (!OPENAI_API_KEY) {
    return { status: "skipped", passes: true, reason: "OPENAI_API_KEY missing for image OCR review." };
  }

  try {
    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: IMAGE_OCR_MODEL,
        max_output_tokens: 1200,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: [
                  "You are an OCR reviewer for generated Korean educational artwork.",
                  "Extract every visible text fragment exactly as it appears.",
                  "Then decide if the image violates these rules:",
                  "- Korean text inside the image must be only short labels or formulas, not full explanatory sentences.",
                  "- Banned visible text includes model/provider names, filenames, app status text, GPT Image2, PDF Parser 평가, 시각자료 준비 중, 학습자료 준비 중.",
                  "- Ignore app overlays outside the raw image. Review only the supplied image.",
                  "Return JSON only with: extractedText array, passes boolean, bannedText array, reason string.",
                ].join("\n"),
              },
              {
                type: "input_image",
                image_url: `data:${image.mimeType || "image/png"};base64,${image.b64}`,
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "generated_image_ocr_review",
            strict: false,
            schema: {
              type: "object",
              properties: {
                extractedText: { type: "array", items: { type: "string" } },
                passes: { type: "boolean" },
                bannedText: { type: "array", items: { type: "string" } },
                reason: { type: "string" },
              },
              required: ["extractedText", "passes", "bannedText", "reason"],
            },
          },
        },
      }),
    });
    const data = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      return {
        status: "failed",
        passes: true,
        reason: data?.error?.message || data?.message || "OCR review failed.",
      };
    }
    const rawText = extractTextFromOpenAIResponse(data);
    return normalizeOcrReview(parseJsonLoose(rawText));
  } catch (error) {
    return {
      status: "failed",
      passes: true,
      reason: error.message || "OCR review failed.",
    };
  }
}

function toImageResponse(image, extras = {}) {
  return {
    b64: image.b64,
    provider: image.provider,
    model: image.model,
    quality: image.quality,
    mimeType: image.mimeType || "image/png",
    ...extras,
  };
}

async function generateImageWithReview(prompt, mode) {
  const normalizedMode = String(mode || IMAGE_PROVIDER || "hybrid").toLowerCase();
  if (normalizedMode === "openai" || normalizedMode === "gpt-image-2" || normalizedMode === "gpt-image-2-low") {
    const image = await generateOpenAIImageCandidate(prompt);
    const ocr = await reviewImageTextWithOcr(image);
    return toImageResponse(image, { ocr });
  }

  if (normalizedMode === "gemini" || normalizedMode === "nano-banana-pro" || normalizedMode === "gemini-pro") {
    const modelId = normalizedMode === "gemini" ? GEMINI_IMAGE_MODEL : GEMINI_PRO_IMAGE_MODEL;
    const image = await generateGeminiImageCandidate(prompt, modelId);
    const ocr = await reviewImageTextWithOcr(image);
    return toImageResponse(image, { ocr });
  }

  const warnings = [];
  let openAiImage = null;
  let openAiOcr = null;

  try {
    openAiImage = await generateOpenAIImageCandidate(prompt);
    openAiOcr = await reviewImageTextWithOcr(openAiImage);
    if (openAiOcr.passes) {
      return toImageResponse(openAiImage, {
        provider: "openai",
        model: OPENAI_IMAGE_MODEL,
        quality: OPENAI_IMAGE_QUALITY,
        ocr: openAiOcr,
        route: "openai-low",
        warnings,
      });
    }
    warnings.push(`OpenAI low OCR 재검토 필요: ${openAiOcr.reason}`);
  } catch (error) {
    warnings.push(`OpenAI low 실패: ${error.message}`);
  }

  try {
    const geminiImage = await generateGeminiImageCandidate(prompt, GEMINI_PRO_IMAGE_MODEL);
    const geminiOcr = await reviewImageTextWithOcr(geminiImage);
    return toImageResponse(geminiImage, {
      ocr: geminiOcr,
      route: "gemini-pro",
      upgradedFrom: openAiImage ? "openai-low" : "",
      warnings,
    });
  } catch (error) {
    warnings.push(`Nano Banana Pro 실패: ${error.message}`);
    if (openAiImage) {
      return toImageResponse(openAiImage, {
        ocr: openAiOcr,
        route: "openai-low",
        degraded: true,
        warnings,
      });
    }
    throw createHttpError(warnings.join(" / ") || error.message, error.status || 502, {
      provider: error.provider || "hybrid",
      model: error.model || `${OPENAI_IMAGE_MODEL}+${GEMINI_PRO_IMAGE_MODEL}`,
      warnings,
    });
  }
}

function normalizeGeneratedScenesPayload(raw) {
  const scenes = Array.isArray(raw?.scenes) ? raw.scenes : [];
  return {
    scenes: scenes.map((scene) => {
      const slides = Array.isArray(scene?.slides) ? scene.slides : [];
      let previousRatio = 0;
      return {
        ...scene,
        title: compactText(scene?.title, ""),
        narration: compactText(scene?.narration || scene?.text, ""),
        slides: slides.map((slide, index) => {
          const fallbackRatio = slides.length > 1 ? index / slides.length : 0;
          let startRatio = index === 0 ? 0 : clampRatio(slide?.startRatio, fallbackRatio);
          if (index > 0) {
            startRatio = Math.max(startRatio, previousRatio + 0.03);
            startRatio = Math.min(startRatio, 0.95);
          }
          previousRatio = startRatio;
          return {
            imagePrompt: compactText(slide?.imagePrompt, ""),
            narrationMarker: compactText(slide?.narrationMarker, ""),
            startRatio,
          };
        }),
      };
    }),
  };
}

function normalizeGeneratedRecapQuiz(raw, scenes) {
  const fallbackTitle = compactText(scenes?.[0]?.chapterTitle || scenes?.[0]?.title, "학습 리캡");
  const rawRecap = raw?.recap || {};
  const chapters = Array.isArray(rawRecap.chapters) ? rawRecap.chapters : [];
  const normalizedChapters = chapters
    .map((chapter, chapterIndex) => ({
      title: compactText(chapter?.title, `챕터 ${chapterIndex + 1}`),
      bullets: (Array.isArray(chapter?.bullets) ? chapter.bullets : [])
        .map((bullet) => ({
          title: compactText(bullet?.title, "핵심 개념"),
          body: compactText(bullet?.body, ""),
        }))
        .filter((bullet) => bullet.body)
        .slice(0, 4),
    }))
    .filter((chapter) => chapter.bullets.length > 0)
    .slice(0, 8);

  const cardsFromChapters = normalizedChapters.flatMap((chapter) =>
    chapter.bullets.map((bullet) => ({
      conceptTitle: bullet.title,
      front: `${bullet.title}에서 꼭 기억할 점은?`,
      back: bullet.body,
      chapterTitle: chapter.title,
    }))
  );
  const normalizedCards = (Array.isArray(rawRecap.cards) ? rawRecap.cards : [])
    .map((card) => ({
      conceptTitle: compactText(card?.conceptTitle, "핵심 개념"),
      front: compactText(card?.front, ""),
      back: compactText(card?.back, ""),
      chapterTitle: compactText(card?.chapterTitle, ""),
    }))
    .filter((card) => card.front && card.back)
    .slice(0, 8);

  const quiz = (Array.isArray(raw?.quiz) ? raw.quiz : [])
    .map((question) => {
      const options = (Array.isArray(question?.options) ? question.options : [])
        .map((option) => compactText(option))
        .filter(Boolean)
        .slice(0, 5);
      const indexes = Array.isArray(question?.correctIndexes)
        ? question.correctIndexes
        : [question?.correctIndex, question?.answer].filter((index) => typeof index !== "undefined");
      const correctIndexes = [...new Set(indexes.map((index) => Number(index)).filter((index) =>
        Number.isInteger(index) && index >= 0 && index < options.length
      ))];

      return {
        question: compactText(question?.question || question?.q),
        options,
        correctIndexes: correctIndexes.length ? correctIndexes : [0],
        explanation: compactText(question?.explanation, ""),
        conceptTitle: compactText(question?.conceptTitle, ""),
      };
    })
    .filter((question) => question.question && question.options.length >= 3)
    .slice(0, 5);

  return {
    recap: {
      title: compactText(rawRecap.title, fallbackTitle),
      chapters: normalizedChapters,
      cards: normalizedCards.length ? normalizedCards : cardsFromChapters.slice(0, 8),
    },
    quiz,
  };
}

function createApp() {
  const app = express();
  const jobStore = createJobStore();
  const authSessionStore = createAuthSessionStore();
  const { handleGeneratePack, handleGetJobStatus, handleSignMediaUrl } = createGenerationHandlers({ jobStore });

  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (_request, response) => {
    response.json({
      ok: true,
      configured:
        LLM_PROVIDER === "gemini" ? Boolean(process.env.GEMINI_API_KEY) : Boolean(process.env.OPENAI_API_KEY),
      model: LLM_PROVIDER === "gemini" ? GEMINI_MODEL : model,
      llmProvider: LLM_PROVIDER,
    });
  });

  app.get("/api/model-combo", (_request, response) => {
    response.json(getModelComboInfo());
  });

  app.post("/api/generate-pack", upload.single("sourceFile"), handleGeneratePack);
  app.get("/api/generate-pack/:jobId/status", handleGetJobStatus);
  app.post("/api/media/sign", handleSignMediaUrl);
  app.post("/api/push-token", async (request, response) => {
    try {
      const user = await getUserFromAuthHeader(request);
      if (!user?.id) {
        response.status(401).json({ error: "Unauthorized" });
        return;
      }

      const token = compactText(request.body?.token, "");
      if (!/^ExponentPushToken\[[^\]]+\]$/.test(token)) {
        response.status(400).json({ error: "Invalid Expo push token." });
        return;
      }

      await upsertPushToken({
        platform: compactText(request.body?.platform, "unknown"),
        token,
        userId: user.id,
      });

      response.json({ ok: true });
    } catch (error) {
      response.status(500).json({ error: error.message || "Failed to save push token." });
    }
  });
  app.post("/api/idea-chat", createIdeaChatHandler());
  app.use("/auth", createAuthRouter({ sessionStore: authSessionStore }));

  app.get("/demo", (_request, response) => {
    response.sendFile(require("path").resolve(__dirname, "../demo.html"));
  });

  app.post("/api/extract-text", upload.single("file"), async (request, response) => {
    if (!request.file) { response.status(400).json({ error: "file required" }); return; }
    try {
      const requestedExtractionMode = String(request.body?.extractionMode || "auto").trim();
      const extractionMode = ["auto", "pdf-parser", "upstage-ocr"].includes(requestedExtractionMode)
        ? requestedExtractionMode
        : "auto";
      const text = await extractSourceTextFromUpload(request.file, { extractionMode });
      response.json({ text });
    } catch (e) {
      response.status(422).json({ error: e.message });
    }
  });

  app.post("/api/generate-quiz", async (request, response) => {
    const scenes = request.body?.scenes;
    if (!scenes || !scenes.length) { response.status(400).json({ error: "scenes required" }); return; }
    const input = buildSceneQuizPrompt(scenes);
    try {
      const out = await generateLLM({
        input,
        max_output_tokens: 8000,
        jsonSchema: QUIZ_JSON_SCHEMA,
      });
      response.json(parseJsonLoose(out.output_text));
    } catch (e) { response.status(500).json({ error: e.message }); }
  });

  app.post("/api/generate-recap-quiz", async (request, response) => {
    const scenes = Array.isArray(request.body?.scenes) ? request.body.scenes : [];
    const pack = request.body?.pack || {};

    if (!scenes.length) {
      response.status(400).json({ error: "scenes required" });
      return;
    }

    const sceneLines = scenes.slice(0, 40).map((scene, index) => {
      const chapter = compactText(scene.chapterTitle || scene.sectionTitle || scene.chapter || "", "기타");
      const title = compactText(scene.shortTitle || scene.title, `쇼츠 ${index + 1}`);
      const narration = compactText(scene.narration || scene.text, "").slice(0, 1400);
      return [
        `SCENE ${index + 1}`,
        `chapter: ${chapter}`,
        `title: ${title}`,
        `narration: ${narration}`,
      ].join("\n");
    }).join("\n\n");

    const input = [
      "너는 한국어 학습 앱의 리캡/퀴즈 편집자다.",
      "아래 쇼츠를 학습자가 모두 본 직후 보여줄 전체 리캡과 퀴즈를 JSON으로만 만든다.",
      "",
      "리캡 요구사항:",
      "- 팩 전체를 챕터 단위로 묶어, 각 챕터에서 무엇을 배웠는지 먼저 알려준다.",
      "- 각 챕터는 2~4개의 핵심 bullet을 가진다.",
      "- bullet은 단순 앞문장 복사가 아니라, 학습자가 기억해야 할 개념을 짧게 재정리한다.",
      "- recap.cards는 퀴즈 전에 넘겨보는 플래시카드다. 4~8장을 만든다.",
      "- 각 카드는 front에 '무엇을 떠올려야 하지?' 형태의 짧은 질문을 쓰고, back에 핵심 요약/예시/주의점을 2~3문장으로 쓴다.",
      "- 카드는 실제 내레이션에서 다룬 핵심만 묻는다. 시험 문제가 아니라 리마인드 카드처럼 만든다.",
      "",
      "퀴즈 요구사항:",
      "- 정확히 5문항을 만든다.",
      "- 문제는 실제 쇼츠 내레이션과 리캡에서 다룬 핵심 개념만 묻는다.",
      "- '예시를 잘 이해했나요?', '다음 중 맞는 것은?'처럼 메타적이거나 느슨한 문항은 금지한다.",
      "- 일부 문항은 자연스러울 때 중복 정답을 허용한다. 중복 정답 문항은 correctIndexes에 2개 이상의 정답 인덱스를 넣고, 질문에도 '모두 고르세요' 취지를 반영한다.",
      "- 모든 문항은 options 4개를 권장하고, 최소 3개 이상이어야 한다.",
      "- explanation은 정답 여부와 관계없이 그 문항이 다루는 개념을 2~3문장으로 조금 더 자세히 설명한다.",
      "",
      "반드시 이 JSON 형태만 반환한다:",
      '{"recap":{"title":"...","chapters":[{"title":"...","bullets":[{"title":"...","body":"..."}]}],"cards":[{"conceptTitle":"...","front":"...","back":"...","chapterTitle":"..."}]},"quiz":[{"question":"...","options":["..."],"correctIndexes":[0],"explanation":"...","conceptTitle":"..."}]}',
      "",
      `Pack title: ${compactText(pack.title, "학습 쇼츠")}`,
      "",
      sceneLines,
    ].join("\n");

    try {
      const out = await generateLLM({
        input,
        max_output_tokens: 7000,
        jsonSchema: {
          name: "recap_quiz",
          schema: {
            type: "object",
            properties: {
              recap: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  chapters: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        bullets: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              title: { type: "string" },
                              body: { type: "string" },
                            },
                            required: ["title", "body"],
                          },
                        },
                      },
                      required: ["title", "bullets"],
                    },
                  },
                  cards: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        conceptTitle: { type: "string" },
                        front: { type: "string" },
                        back: { type: "string" },
                        chapterTitle: { type: "string" },
                      },
                      required: ["conceptTitle", "front", "back", "chapterTitle"],
                    },
                  },
                },
                required: ["title", "chapters", "cards"],
              },
              quiz: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    question: { type: "string" },
                    options: { type: "array", items: { type: "string" } },
                    correctIndexes: { type: "array", items: { type: "integer" } },
                    explanation: { type: "string" },
                    conceptTitle: { type: "string" },
                  },
                  required: ["question", "options", "correctIndexes", "explanation", "conceptTitle"],
                },
              },
            },
            required: ["recap", "quiz"],
          },
        },
      });
      const parsed = parseJsonLoose(out.output_text);
      response.json(normalizeGeneratedRecapQuiz(parsed, scenes));
    } catch (e) {
      response.status(500).json({ error: e.message });
    }
  });

  app.post("/api/generate-scenes", async (request, response) => {
    const text = String(request.body?.text || "").trim();
    if (!text) { response.status(400).json({ error: "text required" }); return; }

    const systemPrompt = `You are the world's most gifted educational content creator.
Your audience: Korean middle school students (age 13–15) encountering these concepts for the first time.
Your goal: produce short-form video scenes where every student watches and thinks "아, 이제 진짜 알겠다!" — not "그래서 뭔 말이야?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOW TO USE THE SOURCE MATERIAL (READ FIRST)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Do NOT summarize or follow the source text's order, wording, or structure. The source is just raw information.
Instead:
1. Fully UNDERSTAND the source — figure out what the core ideas really are and why they matter.
2. Throw away the original sentence flow. Re-DESIGN the explanation from scratch as the clearest possible lesson.
3. FIND THE OUTLINE (매우 중요). If the source already contains a table of contents or numbered headings (예: "01 ...", "1.1 ...", "제1장", "2.3 ..."), THAT is the required structure — reproduce it faithfully as chapters(대단원) and subsections(소단원) using the ORIGINAL numbers and titles. Do NOT collapse a real outline into a few generic scenes. If the source has NO explicit outline, infer a clean 2-level outline yourself (2–4 chapters, each with a few subsections).
4. Make ONE short (one scene) per SUBSECTION(소단원), following the source order. So an outline with 1.1 / 2.1 / 2.2 / 2.3 / 2.4 produces 5 scenes, grouped under chapters 01 and 02. (Cap at ~10 scenes; if the outline has more subsections, merge only the least important ones.)
5. REWRITE each subsection in your own simple words, adding analogies and everyday examples a 13–15 year old already knows. Replace jargon and textbook phrasing with plain Korean.
Think: "If I had to make a confusing textbook click for a kid, how would I rebuild it from zero?" — that is your job, not paraphrasing.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCENE STRUCTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Each scene = ONE 소단원(subsection). Fields:
• chapterTitle    — the 대단원(chapter) heading this subsection belongs to, WITH its number exactly as in the outline. Format "NN 제목" (예: "01 모델 평가의 중요성과 복잡성"). Scenes in the same chapter MUST share the IDENTICAL chapterTitle string.
• subsectionTitle — the 소단원(subsection) heading, WITH its number. Format "N.N 제목" (예: "1.1 소원을 빌 때는 신중히"). Unique per scene, in source order.
• title           — a very short Korean label for this one short (≤10 characters), used in compact UI.
• narration       — Korean explanation (rules below)
• slides          — array of visual slides (rules below)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NARRATION RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• 6–10 Korean sentences.
• Write like a brilliant teacher who loves this subject and wants every student to feel the "아하!" moment.
• Structure: ① hook (왜 신기하거나 중요한지), ② 핵심 개념 설명, ③ 중학생이 아는 것에 빗댄 비유 또는 예시, ④ 한 줄 핵심 정리
• Technical Korean terms must be immediately followed by a plain-language explanation.
• Do NOT use English words anywhere in the narration.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SLIDE RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Decide how many slides this scene needs by matching the TTS narration beats.
Ask yourself: "When the narration changes idea, what new picture should appear so the student understands that exact sentence?"
Most scenes should have 2-4 slides because the narration is 8-10 sentences.
Use 1 slide only when one stable diagram genuinely explains the entire scene.
If the concept has setup → mechanism → contrast/example → takeaway, create a distinct slide for each beat.
Do not reuse the same visual with tiny changes. Each slide must teach a different moment of the narration.

Each slide:

[imagePrompt]
  English description for an AI image generation model.
  GOAL: a pure vertical educational illustration that helps a Korean middle-school student understand the CURRENT narration beat as easily as possible inside a web app. The picture must sync with what the TTS is saying at that moment.
  Do NOT make a chapter poster, cover image, big unit title slide, or generic summary image.
  Do NOT produce a bare minimal icon (e.g. just a rocket with two arrows). That is useless. Instead depict the concept as a RICH, CONCRETE, RELATABLE SCENE that actually shows the mechanism happening — with recognizable real-world objects/characters a 14-year-old knows, plus clear visual indicators (force arrows, motion lines, glows, size/color differences, before-vs-after) that reveal WHY it works.
  Be extremely specific: describe the scene, the objects, exact shapes, colors, positions, arrow directions, relative sizes, and what each element is doing.

  BAD (too minimal, unhelpful):  "A rocket with green arrows up and red arrows down."
  GOOD (rich, teaches the idea): "Vertical educational illustration of Newton's third law shown as a relatable scene. A cartoon teenager on a skateboard faces a brick wall and pushes it hard with both hands; thick orange arrows point FROM the hands INTO the wall (action). An equally thick blue arrow of the SAME length points back FROM the wall INTO the teenager, and the skateboard rolls backward with curved grey motion lines under the wheels (reaction). The two arrows are clearly the same size to show equal force. Friendly flat-vector cartoon style, warm bright colors, soft shading, clean bold outlines, plain light background."

  ABSOLUTE RULES:
  • Do not write explanatory prose, full sentences, subtitles, UI text, or paragraph-like labels in any language.
    Short Korean labels, short Korean titles inside a diagram, mathematical notation, formulas, axis labels, legends, and concise callouts are allowed only when they directly improve learning accuracy.
    Keep all rendered text short and proofread-looking. If unsure, use symbols, arrows, numbers, formulas, and app-rendered text areas instead of long image text.
    Never place a large lesson title, chapter name, subsection name, or cover-style title at the top of the image.
    Never render a table-of-contents screen, numbered bullet-card list, title page, lesson menu, app fallback card layout, or any image that is mostly text boxes.
  • Each slide must be VISUALLY DISTINCT from the others — a different scene/angle, object set, diagram structure, color emphasis, or camera distance, not the same picture with minor changes.
    Add a clear visual beat in the prompt: what changes on this slide, why it appears now, and how it differs from the previous slide.
  • Style: a polished, friendly, detailed EDUCATIONAL ILLUSTRATION — like a high-quality modern textbook or explainer-video frame. Flat-vector cartoon look with soft shading, warm vivid colors, clean bold outlines, light/white background. Rich and informative, but organized and uncluttered — every element has a teaching purpose.
  • COMPOSITION — this is RAW EDUCATIONAL ARTWORK in a TALL 9:16 vertical illustration generated at 1024×1792 and used behind a web app's own phone-like UI.
    - The image must be composed natively for this exact vertical illustration frame from the start.
    - Do NOT create a landscape, square, poster, slide-deck, or wide illustration and adapt it into vertical. Do NOT rely on later cropping, zooming, padding, or reframing.
    - Fill the entire 9:16 canvas with artwork/background. Do NOT make letterboxing, white poster margins, framed slide borders, contain-style padding, a screenshot inside a phone, or a complete mobile app screen.
    - CRITICAL: do NOT draw any phone frame, device border, rounded phone viewport, notch, dynamic island, status bar, clock, battery icon, signal icon, Wi-Fi icon, speed button, progress bar, subtitle/caption strip, app tab bar, browser chrome, button, or app UI. The web app will overlay all phone-like UI itself.
    - WEB APP OVERLAY SAFE AREA: the top center and top corners will be covered by the app's real notch/status/progress UI. Treat the top 18% of the image as an overlay-safe header zone without drawing UI or titles there.
    - In that top 18% header zone, especially the top-center 40% of the image width and top corners, place only simple natural background, sky, wall, soft color, or non-essential atmosphere. NEVER place a face, main character, key diagram node, arrowhead, label, formula, title, or important visual cue there.
    - Put the core teaching action and the most important diagram elements below this top overlay-safe zone, while still using a natural full-height vertical composition.
    - No important object, arrow, character, diagram part, or visual cue may touch or extend beyond the image edges.
    - Keep a small clean breathing margin on all four sides, but do not create a framed poster or border. Fill the full height naturally with the educational scene.

[narrationMarker]
  The EXACT first 8–12 Korean characters of the narration sentence where this slide appears.
  Rules:
  • Must be copied VERBATIM from the narration (used for exact string matching).
  • The FIRST slide's narrationMarker MUST be the very first characters of the narration.
  • Switch slides only when the concept genuinely changes — a new slide means a genuinely new visual idea.

[startRatio]
  A number from 0 to 0.95 showing when this slide starts in the narration timeline.
  The first slide MUST be 0.
  Later slides must increase in order and should match the narration beat where their visual becomes relevant.
  Example for 3 slides: 0, 0.34, 0.68.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Return ONLY valid JSON. No explanation, no markdown.
{"scenes":[{"chapterTitle":"01 ...","subsectionTitle":"1.1 ...","title":"...","narration":"...","slides":[{"imagePrompt":"...","narrationMarker":"...","startRatio":0}]}]}`;

    const input = buildScenesInput(text);

    try {
      const out = await generateLLM({
        input,
        max_output_tokens: 32000,
        jsonSchema: SCENES_JSON_SCHEMA,
      });
      response.json(normalizeScenesShared(parseJsonLoose(out.output_text)));
    } catch (e) { response.status(500).json({ error: e.message }); }
  });

  app.post("/api/generate-image", async (request, response) => {
    const { prompt, provider } = request.body || {};
    if (!prompt) { response.status(400).json({ error: "prompt required" }); return; }

    try {
      response.json(await generateImageWithReview(prompt, provider));
    } catch (e) {
      response.status(e.status || 500).json({
        error: e.message,
        code: e.code,
        provider: e.provider,
        model: e.model,
        warnings: e.warnings,
      });
    }
  });

  app.post("/api/tts", async (request, response) => {
    const text = String(request.body?.text || "").trim();
    if (!text) { response.status(400).json({ error: "text required" }); return; }
    try {
      const upstream = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
          voice: process.env.OPENAI_TTS_VOICE || "coral",
          input: text,
          speed: Number(process.env.OPENAI_TTS_SPEED) || 1.0,
          response_format: "mp3",
        }),
      });
      if (!upstream.ok) {
        const err = await upstream.text();
        response.status(upstream.status).json({ error: err });
        return;
      }
      const buffer = Buffer.from(await upstream.arrayBuffer());
      response.set("Content-Type", "audio/mpeg");
      response.send(buffer);
    } catch (error) {
      response.status(500).json({ error: error.message });
    }
  });

  // Serve static files from web/dist (frontend Vite build output)
  const distPath = path.join(__dirname, "../web/dist");
  app.use(express.static(distPath));

  // SPA fallback for frontend routing, excluding api and auth paths
  app.get("*", (request, response, next) => {
    if (request.path.startsWith("/api") || request.path.startsWith("/auth")) {
      return next();
    }
    response.sendFile(path.join(distPath, "index.html"));
  });

  return app;
}

const app = createApp();

if (require.main === module) {
  app.listen(port, host, () => {
    console.log(`SnapMind backend listening on http://${host}:${port}`);
  });
}

module.exports = {
  app,
  createApp,
};
