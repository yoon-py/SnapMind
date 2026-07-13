const OpenAI = require("openai");

const { GEMINI_API_KEY, GEMINI_MODEL, LLM_PROVIDER, model } = require("../config/generation");

const GEMINI_FALLBACK_MODELS = [
  GEMINI_MODEL,
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemini-3.5-flash",
  "gemini-3-flash-preview",
].filter((m, i, arr) => m && arr.indexOf(m) === i);

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is missing.");
  }

  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const GEMINI_UNSUPPORTED_SCHEMA_KEYS = new Set([
  "additionalProperties",
  "minItems",
  "maxItems",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "uniqueItems",
  "$schema",
  "$defs",
  "$ref",
  "unevaluatedProperties",
  "const",
  "if",
  "then",
  "else",
  "not",
  "contentEncoding",
  "contentMediaType",
]);

function sanitizeSchemaForGemini(schema) {
  if (!schema || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) return schema.map(sanitizeSchemaForGemini);

  const result = {};
  for (const [key, value] of Object.entries(schema)) {
    if (GEMINI_UNSUPPORTED_SCHEMA_KEYS.has(key)) continue;
    result[key] = sanitizeSchemaForGemini(value);
  }
  return result;
}

async function uploadFileToGemini(buffer, mimeType) {
  const boundary = `GeminiBoundary${Date.now()}`;
  const metadata = JSON.stringify({ file: { display_name: "uploaded_file" } });

  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n`),
    Buffer.from(metadata),
    Buffer.from(`\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer),
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "multipart",
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Gemini file upload failed: ${err?.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.file.uri;
}

async function withRetry(fn, maxAttempts = 6) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRetryable =
        err.message?.includes("fetch failed") ||
        err.message?.includes("high demand") ||
        err.message?.includes("503") ||
        err.message?.includes("overloaded");
      if (!isRetryable || attempt === maxAttempts) throw err;
      const delay = Math.min(1000 * 2 ** (attempt - 1), 8000);
      console.warn(`[retry ${attempt}/${maxAttempts}] ${err.message} — waiting ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

async function generateLLM({ input, max_output_tokens, jsonSchema, fileBuffer, fileMimeType }) {
  if (LLM_PROVIDER === "gemini") {
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is missing.");
    }

    const generationConfig = {
      maxOutputTokens: max_output_tokens || 65536,
      temperature: 0.7,
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 0 },
      ...(jsonSchema ? { responseSchema: sanitizeSchemaForGemini(jsonSchema.schema) } : {}),
    };

    const parts = [];

    if (fileBuffer && fileMimeType) {
      const fileUri = await uploadFileToGemini(fileBuffer, fileMimeType);
      parts.push({ file_data: { mime_type: fileMimeType, file_uri: fileUri } });
    }

    parts.push({ text: input });

    let lastError;
    for (const modelId of GEMINI_FALLBACK_MODELS) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${GEMINI_API_KEY}`;
        const result = await withRetry(async () => {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 30 * 1000);
          const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts }], generationConfig }),
            signal: controller.signal,
          });
          clearTimeout(timeout);

          const data = await response.json();
          if (data.error) throw new Error(`Gemini API error: ${data.error.message}`);

          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!text) throw new Error("Gemini did not return text output.");

          const finishReason = data.candidates[0].finishReason;
          console.log(`Gemini [${modelId}] finish: ${finishReason}, tokens: ${JSON.stringify(data.usageMetadata || {})}`);
          if (finishReason === "MAX_TOKENS") console.warn("[WARN] Gemini hit MAX_TOKENS");

          return { output_text: text };
        });
        return result;
      } catch (err) {
        const isFallbackable =
          err.message?.includes("high demand") ||
          err.message?.includes("no longer available") ||
          err.message?.includes("503") ||
          err.message?.includes("overloaded");
        lastError = err;
        if (isFallbackable && modelId !== GEMINI_FALLBACK_MODELS[GEMINI_FALLBACK_MODELS.length - 1]) {
          console.warn(`[model-fallback] ${modelId} unavailable, trying next model...`);
          continue;
        }
        throw err;
      }
    }
    throw lastError;
  }

  const client = getOpenAIClient();
  const hasFileInput = fileBuffer && fileMimeType;
  const openAiInput = hasFileInput
    ? [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: input,
            },
            {
              type: "input_file",
              filename: "source-file",
              file_data: `data:${fileMimeType};base64,${Buffer.from(fileBuffer).toString("base64")}`,
            },
          ],
        },
      ]
    : input;
  const params = {
    model,
    max_output_tokens: max_output_tokens || 65536,
    input: openAiInput,
  };

  if (jsonSchema) {
    params.text = {
      format: {
        type: "json_schema",
        name: jsonSchema.name,
        schema: jsonSchema.schema,
        strict: false,
      },
    };
  }

  const generation = await client.responses.create(params);
  return { output_text: generation.output_text };
}

generateLLM.__modelId = LLM_PROVIDER === "gemini" ? GEMINI_MODEL : model;

module.exports = {
  generateLLM,
};
