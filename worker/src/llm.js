import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

function getAIClient(env) {
  if (env.ANTHROPIC_API_KEY) {
    return { type: "anthropic", client: new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) };
  }

  if (env.OPENAI_API_KEY) {
    return { type: "openai", client: new OpenAI({ apiKey: env.OPENAI_API_KEY }) };
  }

  throw new Error("No API key found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.");
}

async function aiGenerateJSON(ai, { model, maxTokens, prompt, schema, schemaName, timeoutMs = 120000 }) {
  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    if (ai.type === "anthropic") {
      const response = await ai.client.messages.create(
        {
          model,
          max_tokens: maxTokens,
          messages: [{ role: "user", content: prompt }],
          tools: [
            {
              name: schemaName,
              description: `Generate structured ${schemaName} output`,
              input_schema: schema,
            },
          ],
          tool_choice: { type: "tool", name: schemaName },
        },
        { signal: abortController.signal }
      );

      const toolBlock = response.content.find((block) => block.type === "tool_use");
      if (!toolBlock) {
        throw new Error("Claude did not return structured output.");
      }

      return toolBlock.input;
    }

    const completion = await ai.client.chat.completions.create(
      {
        model,
        max_completion_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
        response_format: {
          type: "json_schema",
          json_schema: { name: schemaName, schema, strict: true },
        },
      },
      { signal: abortController.signal }
    );

    const text = completion.choices?.[0]?.message?.content || "";
    if (!text) {
      throw new Error("OpenAI did not return structured output.");
    }

    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

export async function generateLLM({
  env,
  input,
  max_output_tokens,
  jsonSchema,
  fileBuffer,
  fileMimeType,
}) {
  const llmProvider = env.LLM_PROVIDER || "openai";

  if (llmProvider === "gemini") {
    const geminiApiKey = env.GEMINI_API_KEY;
    const geminiModel = env.GEMINI_MODEL || "gemini-3-flash-preview";

    if (!geminiApiKey) {
      throw new Error("GEMINI_API_KEY is missing.");
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`;
    const generationConfig = {
      maxOutputTokens: max_output_tokens || 65536,
      temperature: 0.7,
      responseMimeType: "application/json",
      ...(jsonSchema ? { responseSchema: jsonSchema.schema } : {}),
    };

    const parts = [];
    if (fileBuffer && fileMimeType) {
      const base64Data =
        typeof fileBuffer.toString === "function"
          ? fileBuffer.toString("base64")
          : btoa(String.fromCharCode(...new Uint8Array(fileBuffer)));
      parts.push({
        inline_data: {
          mime_type: fileMimeType,
          data: base64Data,
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

    return { output_text: text };
  }

  const ai = getAIClient(env);
  const model = env.OPENAI_MODEL || "gpt-5.4";

  if (jsonSchema) {
    const result = await aiGenerateJSON(ai, {
      model,
      maxTokens: max_output_tokens || 16384,
      prompt: input,
      schema: jsonSchema.schema,
      schemaName: jsonSchema.name,
      timeoutMs: 5 * 60 * 1000,
    });
    return { output_text: JSON.stringify(result) };
  }

  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort(), 5 * 60 * 1000);

  try {
    if (ai.type === "anthropic") {
      const response = await ai.client.messages.create(
        {
          model,
          max_tokens: max_output_tokens || 1024,
          messages: [{ role: "user", content: input }],
        },
        { signal: abortController.signal }
      );

      const text = response.content?.find((block) => block.type === "text")?.text || "";
      return { output_text: text };
    }

    const completion = await ai.client.chat.completions.create(
      {
        model,
        max_completion_tokens: max_output_tokens || 1024,
        messages: [{ role: "user", content: input }],
      },
      { signal: abortController.signal }
    );

    const text = completion.choices?.[0]?.message?.content || "";
    return { output_text: text };
  } finally {
    clearTimeout(timer);
  }
}
