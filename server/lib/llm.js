const OpenAI = require("openai");

const {
  GEMINI_API_KEY,
  GEMINI_MODEL,
  LLM_BASE_URL,
  LLM_PROVIDER,
  LOCAL_LLM_MODEL,
  model,
} = require("../config/generation");

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is missing.");
  }

  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// Client for a local / OpenAI-compatible server (Ollama, LM Studio, ...).
// These servers implement the Chat Completions API rather than the Responses
// API, and ignore the API key, so a placeholder is fine.
function getLocalClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || "local",
    baseURL: LLM_BASE_URL,
  });
}

// Runs a prompt against a local OpenAI-compatible model via Chat Completions.
// Local servers rarely support strict `json_schema` structured outputs, so we
// use the broadly-supported `json_object` mode and inline the schema into the
// prompt instead.
async function generateLocal({ input, max_output_tokens, jsonSchema, fileBuffer }) {
  if (fileBuffer) {
    console.warn(
      "[WARN] LLM_PROVIDER=local does not support file inputs; extract text first. Ignoring file."
    );
  }

  let content = input;
  const params = {
    model: LOCAL_LLM_MODEL,
    max_tokens: max_output_tokens || 4096,
  };

  if (jsonSchema) {
    params.response_format = { type: "json_object" };
    content = `${input}\n\nRespond ONLY with valid JSON matching this schema (no markdown, no commentary):\n${JSON.stringify(
      jsonSchema.schema
    )}`;
  }

  params.messages = [{ role: "user", content }];

  const client = getLocalClient();
  const completion = await client.chat.completions.create(params);
  const text = completion.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("Local LLM did not return text output.");
  }

  const finishReason = completion.choices[0].finish_reason;
  console.log(
    `Local [${LOCAL_LLM_MODEL}] finish: ${finishReason}, output length: ${text.length} chars`
  );
  if (finishReason === "length") {
    console.warn("[WARN] Local LLM hit token limit - output may be truncated!");
  }

  return { output_text: text };
}

async function generateLLM({ input, max_output_tokens, jsonSchema, fileBuffer, fileMimeType }) {
  if (LLM_PROVIDER === "local") {
    return generateLocal({ input, max_output_tokens, jsonSchema, fileBuffer });
  }

  if (LLM_PROVIDER === "gemini") {
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is missing.");
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const generationConfig = {
      maxOutputTokens: max_output_tokens || 65536,
      temperature: 0.7,
      responseMimeType: "application/json",
      ...(jsonSchema ? { responseSchema: jsonSchema.schema } : {}),
    };

    const parts = [];

    if (fileBuffer && fileMimeType) {
      parts.push({
        inline_data: {
          mime_type: fileMimeType,
          data: fileBuffer.toString("base64"),
        },
      });
    }

    parts.push({ text: input });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await response.json();

    if (data.error) {
      throw new Error(`Gemini API error: ${data.error.message}`);
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error("Gemini did not return text output.");
    }

    const finishReason = data.candidates[0].finishReason;
    console.log(`Gemini [${GEMINI_MODEL}] finish: ${finishReason}, tokens: ${JSON.stringify(data.usageMetadata || {})}`);
    console.log(`Gemini output length: ${text.length} chars`);
    if (finishReason === "MAX_TOKENS") {
      console.warn("[WARN] Gemini hit MAX_TOKENS - output was truncated!");
    }

    return { output_text: text };
  }

  const client = getOpenAIClient();
  const params = {
    model,
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

  const generation = await client.responses.create(params);
  return { output_text: generation.output_text };
}

module.exports = {
  generateLLM,
};
