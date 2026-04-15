const DEFAULT_GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image-preview";

export type GeminiImageConfig = {
  apiKey: string;
  model: string;
};

function decodeBase64(base64: string) {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(base64, "base64"));
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function getFileExtensionFromMimeType(mimeType: string) {
  if (/png/i.test(mimeType)) {
    return "png";
  }

  if (/webp/i.test(mimeType)) {
    return "webp";
  }

  if (/jpeg|jpg/i.test(mimeType)) {
    return "jpg";
  }

  return "png";
}

export function resolveGeminiImageConfig(raw: {
  apiKey?: string;
  model?: string;
}) {
  const apiKey = String(raw.apiKey || "").trim();
  const model = String(raw.model || DEFAULT_GEMINI_IMAGE_MODEL).trim() || DEFAULT_GEMINI_IMAGE_MODEL;

  if (!apiKey) {
    return null;
  }

  return {
    apiKey,
    model,
  } as GeminiImageConfig;
}

export function buildShortSceneImagePrompt({
  packTitle,
  ideaTitle,
  languageCode,
  scene,
}: {
  packTitle: string;
  ideaTitle: string;
  languageCode?: string;
  scene: {
    headline?: string;
    body?: string;
    callouts?: string[];
    visualStyle?: string;
    layoutHint?: string;
  };
}) {
  const callouts = Array.isArray(scene.callouts) ? scene.callouts.filter(Boolean).join(", ") : "";
  const dominantLanguageLabel =
    languageCode === "ko" ? "Korean" : languageCode === "da" ? "Danish" : "English";

  return [
    "Create a clean educational illustration for a vertical short lecture slide.",
    "Style: polished infographic, vector-like, blueprint-friendly, crisp shapes, bright background, no UI chrome.",
    `The dominant lesson language is ${dominantLanguageLabel}.`,
    "Important: do not render readable text, captions, logos, letters, or watermarks inside the image.",
    "Do not include English UI labels, Latin chart labels, fake subtitles, or pseudo-text textures.",
    "If the model absolutely cannot avoid incidental symbols, they must be minimal and match the dominant lesson language rather than English.",
    `Pack topic: ${packTitle}`,
    `Idea: ${ideaTitle}`,
    `Scene focus: ${scene.headline || ""}`,
    `Concept summary: ${scene.body || ""}`,
    callouts ? `Key visual cues: ${callouts}` : null,
    scene.visualStyle ? `Visual style hint: ${scene.visualStyle}` : null,
    scene.layoutHint ? `Layout hint: ${scene.layoutHint}` : null,
    "Compose a single supporting image that can sit behind or beside app-rendered headline/body overlays in a vertical learning short.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generateShortSceneImage({
  config,
  prompt,
  fetchImpl = fetch,
}: {
  config: GeminiImageConfig;
  prompt: string;
  fetchImpl?: typeof fetch;
}) {
  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      }),
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `Gemini image generation failed: ${data?.error?.message || data?.message || response.statusText}`
    );
  }

  const parts = Array.isArray(data?.candidates?.[0]?.content?.parts)
    ? data.candidates[0].content.parts
    : [];
  const imagePart =
    parts.find((part: any) => part?.inlineData?.data) ||
    parts.find((part: any) => part?.inline_data?.data);
  const imageData = String(imagePart?.inlineData?.data || imagePart?.inline_data?.data || "");
  const mimeType = String(
    imagePart?.inlineData?.mimeType || imagePart?.inline_data?.mime_type || "image/png"
  );

  if (!imageData) {
    throw new Error("Gemini image model did not return image bytes.");
  }

  return {
    imageBytes: decodeBase64(imageData),
    mimeType,
    fileExtension: getFileExtensionFromMimeType(mimeType),
    model: config.model,
  };
}
