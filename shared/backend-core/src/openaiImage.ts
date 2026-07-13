const DEFAULT_OPENAI_IMAGE_MODEL = "gpt-image-2";
const DEFAULT_IMAGE_SIZE = "1024x1536";
const DEFAULT_IMAGE_QUALITY = "low";

export type OpenAIImageConfig = {
  apiKey: string;
  model: string;
  size: string;
  quality: string;
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
  if (/webp/i.test(mimeType)) {
    return "webp";
  }

  if (/jpeg|jpg/i.test(mimeType)) {
    return "jpg";
  }

  return "png";
}

export function resolveOpenAIImageConfig(raw: {
  apiKey?: string;
  model?: string;
  size?: string;
  quality?: string;
}) {
  const apiKey = String(raw.apiKey || "").trim();
  const model = String(raw.model || DEFAULT_OPENAI_IMAGE_MODEL).trim() || DEFAULT_OPENAI_IMAGE_MODEL;
  const size = String(raw.size || DEFAULT_IMAGE_SIZE).trim() || DEFAULT_IMAGE_SIZE;
  const quality = String(raw.quality || process.env.OPENAI_IMAGE_QUALITY || DEFAULT_IMAGE_QUALITY).trim() || DEFAULT_IMAGE_QUALITY;

  if (!apiKey) {
    return null;
  }

  return {
    apiKey,
    model,
    size,
    quality,
  } as OpenAIImageConfig;
}

export async function generateOpenAIImage({
  config,
  prompt,
  size,
  fetchImpl = fetch,
}: {
  config: OpenAIImageConfig;
  prompt: string;
  size?: string;
  fetchImpl?: typeof fetch;
}) {
  const response = await fetchImpl("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      prompt,
      size: size || config.size,
      quality: config.quality,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`OpenAI image generation failed: ${data?.error?.message || response.statusText}`);
  }

  const firstImage = Array.isArray(data?.data) ? data.data[0] : null;
  const b64 = String(firstImage?.b64_json || "");
  if (b64) {
    return {
      imageBytes: decodeBase64(b64),
      mimeType: "image/png",
      fileExtension: "png",
      model: config.model,
    };
  }

  const imageUrl = String(firstImage?.url || "");
  if (!imageUrl) {
    throw new Error("OpenAI image model did not return image bytes or a URL.");
  }

  const imageResponse = await fetchImpl(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`OpenAI image download failed: ${imageResponse.statusText}`);
  }

  const mimeType = imageResponse.headers.get("content-type") || "image/png";
  return {
    imageBytes: new Uint8Array(await imageResponse.arrayBuffer()),
    mimeType,
    fileExtension: getFileExtensionFromMimeType(mimeType),
    model: config.model,
  };
}
