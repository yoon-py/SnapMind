import { Hono } from "hono";
import { cors } from "hono/cors";

import {
  buildIdeaChatPrompt,
  collectIdeaContextText,
  createSignedShortAudioUrl,
  createKvJobPersistence,
  createPersistentJobStore,
  createSupabaseJobPersistence,
  detectSourceLanguage,
  enrichShortsPackWithAudio,
  generatePackFromSource,
  hasIdeaContext,
  normalizeIdeaChatMessages,
  normalizeIdeaContext,
} from "../../shared/backend-core/dist/esm/index.js";
import { normalizeSourceMaterialText, trimText } from "../../shared/backend-core/dist/esm/text.js";
import { generateLLM } from "./llm.js";
import {
  assessExtractedTextQuality,
  extractSourceTextFromUpload,
  isExtractedTextMeaningful,
  isImageUpload,
  isSupportedUpload,
} from "./sourceExtraction.js";

const app = new Hono();

app.use("*", cors());

function createJobStore(env) {
  const supabasePersistence = createSupabaseJobPersistence({
    supabaseUrl: env.SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const kvPersistence = createKvJobPersistence(env.JOBS || null);

  return createPersistentJobStore({
    persistence: supabasePersistence || kvPersistence,
    ttlMs: 5 * 60 * 1000,
  });
}

function applyPatch(job, patch) {
  Object.entries(patch).forEach(([key, value]) => {
    if (typeof value !== "undefined") {
      job[key] = value;
    }
  });
}

app.get("/health", (c) => {
  const llmProvider = c.env.LLM_PROVIDER || "openai";
  const model =
    llmProvider === "gemini" ? c.env.GEMINI_MODEL || "gemini-3-flash-preview" : c.env.OPENAI_MODEL || "gpt-5.4";

  return c.json({
    ok: true,
    configured:
      llmProvider === "gemini" ? Boolean(c.env.GEMINI_API_KEY) : Boolean(c.env.OPENAI_API_KEY || c.env.ANTHROPIC_API_KEY),
    model,
    llmProvider,
  });
});

app.post("/api/generate-pack", async (c) => {
  const body = await c.req.parseBody();
  const jobStore = createJobStore(c.env);

  const title = trimText(body?.title, "");
  const author = trimText(body?.author, "");
  const category = trimText(body?.category, "");
  const packFormat = trimText(body?.packFormat, "shorts") === "cards" ? "cards" : "shorts";

  let sourceText = normalizeSourceMaterialText(body?.sourceText);
  let file = null;

  const rawFile = body?.sourceFile;
  if (rawFile && rawFile instanceof File) {
    const arrayBuffer = await rawFile.arrayBuffer();
    file = {
      buffer: Buffer.from(arrayBuffer),
      originalname: rawFile.name,
      mimetype: rawFile.type,
    };
  }

  const llmProvider = c.env.LLM_PROVIDER || "openai";
  let geminiFileBuffer = null;
  let geminiFileMimeType = null;
  const canFallbackToGeminiMultimodal =
    llmProvider === "gemini" && file && isImageUpload(file);

  if (file) {
    if (!isSupportedUpload(file)) {
      return c.json(
        {
          error: "Unsupported file format. Upload PDF, DOCX, HWP, TXT, MD, CSV, JSON, HTML, XML, or RTF.",
        },
        400
      );
    }

    let extractedText = "";
    let extractionError = null;

    try {
        extractedText = await extractSourceTextFromUpload(file, c.env);
    } catch (error) {
      extractionError = error;
    }

    const hasMeaningfulExtractedText =
      extractedText && isExtractedTextMeaningful(extractedText) && assessExtractedTextQuality(extractedText).ok;

    if (hasMeaningfulExtractedText) {
      sourceText = extractedText;
    } else if (canFallbackToGeminiMultimodal) {
      geminiFileBuffer = file.buffer;
      geminiFileMimeType = file.mimetype || "application/octet-stream";
      sourceText = "[file attached for multimodal processing]";
      console.warn(
        `[gemini] Falling back to direct multimodal generation because text extraction was insufficient: ${
          extractionError?.message || "low-quality extracted text"
        }`
      );
    } else {
      return c.json(
        {
          error: "Could not extract enough readable text from the uploaded file.",
          details: extractionError?.message || "Extracted text was too short or garbled.",
        },
        400
      );
    }
  }

  if (!sourceText || !trimText(sourceText, "")) {
    return c.json(
      {
        error: file
          ? "The PDF did not contain extractable text. Please upload a text-based PDF."
          : "Please provide source text.",
      },
      400
    );
  }

  if (!geminiFileBuffer) {
    if (file && !isExtractedTextMeaningful(sourceText)) {
      return c.json(
        {
          error: "The uploaded file contained almost no readable text. It may be an image-based PDF that could not be processed. Please try a different file.",
        },
        400
      );
    }

    if (file) {
      const quality = assessExtractedTextQuality(sourceText);
      if (!quality.ok) {
        const message =
          quality.reason === "garbled"
            ? "파일에서 텍스트를 추출했지만 내용이 깨져서 읽을 수 없습니다. 텍스트 기반 PDF 또는 TXT 파일로 다시 시도해 주세요."
            : "파일에서 읽을 수 있는 텍스트가 없습니다. 다른 파일로 시도해 주세요.";
        return c.json({ error: message }, 400);
      }
    }
  }

  const jobId = crypto.randomUUID();
  const job = await jobStore.create(jobId);

  c.executionCtx.waitUntil(
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
          llmProvider,
          generateLLM: (args) => generateLLM({ env: c.env, ...args }),
          onProgress: async (patch) => applyPatch(job, patch),
        });

        const packWithAudio = await enrichShortsPackWithAudio({
          pack: result.pack,
          ttsConfig: {
            apiKey: c.env.GEMINI_API_KEY,
            model: c.env.GEMINI_TTS_MODEL,
            voiceName: c.env.GEMINI_TTS_VOICE,
          },
          imageConfig: {
            apiKey: c.env.GEMINI_API_KEY,
            model: c.env.GEMINI_IMAGE_MODEL,
          },
          storageConfig: {
            supabaseUrl: c.env.SUPABASE_URL,
            serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
            bucketName: c.env.SUPABASE_AUDIO_BUCKET || "shorts-audio",
          },
          generateSceneImages: c.env.SHORTS_GENERATE_IMAGES === "1",
          onProgress: async (patch) => applyPatch(job, patch),
        });

        job.status = "done";
        job.pack = packWithAudio;
        job.debug = result.debug;
        jobStore.scheduleCleanup(jobId);
      } catch (error) {
        console.error("Worker generation failed:", error);
        job.status = "error";
        job.error = error.message || "Failed to generate a pack from the source.";
        jobStore.scheduleCleanup(jobId);
      }
    })()
  );

  return c.json({ jobId });
});

app.get("/api/generate-pack/:jobId/status", async (c) => {
  const jobStore = createJobStore(c.env);
  const jobId = c.req.param("jobId");
  const job = await jobStore.get(jobId);

  if (!job) {
    return c.json({ error: "Job not found or expired." }, 404);
  }

  const debug = job.debug || null;

  if (job.status === "done") {
    await jobStore.remove(jobId);
    return c.json({ status: "done", pack: job.pack, debug });
  }

  if (job.status === "error") {
    await jobStore.remove(jobId);
    return c.json({ status: "error", error: job.error, debug });
  }

  return c.json({
    status: "working",
    step: job.step,
    totalChunks: job.totalChunks,
    completedChunks: job.completedChunks,
    debug,
  });
});

app.post("/api/media/sign", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const path = trimText(body?.path, "");
  const bucketName = trimText(body?.bucketName, c.env.SUPABASE_AUDIO_BUCKET || "shorts-audio");
  const expiresIn = Math.max(60, Math.min(60 * 60 * 24, Number(body?.expiresIn || 60 * 60)));

  if (!path) {
    return c.json({ error: "A storage path is required." }, 400);
  }

  try {
    const signed = await createSignedShortAudioUrl({
      path,
      bucketName,
      expiresIn,
      storageConfig: {
        supabaseUrl: c.env.SUPABASE_URL,
        serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
        bucketName,
      },
    });

    return c.json(signed);
  } catch (error) {
    return c.json({ error: error.message || "Failed to create a signed media URL." }, 500);
  }
});

app.post("/api/idea-chat", async (c) => {
  const body = await c.req.json();
  const ideaContext = normalizeIdeaContext(body?.ideaContext);
  const messages = normalizeIdeaChatMessages(body?.messages);
  const latestMessage = messages.at(-1);

  if (!hasIdeaContext(ideaContext)) {
    return c.json({ error: "A valid idea context is required." }, 400);
  }

  if (!latestMessage || latestMessage.role !== "user" || !latestMessage.content) {
    return c.json({ error: "A non-empty learner message is required." }, 400);
  }

  try {
    const languageProfile = detectSourceLanguage(collectIdeaContextText(ideaContext));
    const generation = await generateLLM({
      env: c.env,
      input: buildIdeaChatPrompt({ ideaContext, messages, languageProfile }),
      max_output_tokens: 1024,
    });
    const reply = trimText(generation.output_text, "");

    if (!reply) {
      throw new Error("LLM did not return a tutor reply.");
    }

    return c.json({ reply });
  } catch (_) {
    return c.json({ error: "Failed to answer the question about this idea." }, 500);
  }
});

app.get("/auth/callback", (c) => {
  const returnScheme = c.req.query("returnScheme") || "snapmind://";
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#FCFBF7;color:#321007;text-align:center}
.box{padding:40px}.check{font-size:48px;margin-bottom:16px}.msg{font-size:18px;font-weight:600}.sub{font-size:14px;color:#7A6452;margin-top:8px}</style></head>
<body><div class="box"><div class="check">&#10003;</div><div class="msg">로그인 성공!</div><div class="sub">잠시만 기다려주세요...</div></div>
<script>
(function(){
  var h=window.location.hash.substring(1);
  if(!h)return;
  var p=new URLSearchParams(h);
  var at=p.get("access_token"),rt=p.get("refresh_token");
  if(!at)return;
  var scheme="${returnScheme}";
  var sep=scheme.indexOf("?")>=0?"&":"?";
  window.location.href=scheme+sep+"access_token="+encodeURIComponent(at)+"&refresh_token="+encodeURIComponent(rt);
})();
</script></body></html>`;
  return c.html(html);
});

export default app;
