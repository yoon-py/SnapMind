const OpenAI = require("openai");

const { GEMINI_API_KEY, GEMINI_MODEL, LLM_PROVIDER, model } = require("../config/generation");

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is missing.");
  }

  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

async function generateLLM({ input, max_output_tokens, jsonSchema, fileBuffer, fileMimeType }) {
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
