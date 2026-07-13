const DEFAULT_GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image";

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

function getImageCandidateFromGemini(value: any): { imageData: string; mimeType: string } | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const direct = value.output_image || value.outputImage;
  if (direct?.data) {
    return {
      imageData: String(direct.data),
      mimeType: String(direct.mime_type || direct.mimeType || "image/png"),
    };
  }

  if (value.data && /image\//i.test(String(value.mime_type || value.mimeType || ""))) {
    return {
      imageData: String(value.data),
      mimeType: String(value.mime_type || value.mimeType || "image/png"),
    };
  }

  if (value.inlineData?.data || value.inline_data?.data) {
    const inline = value.inlineData || value.inline_data;
    return {
      imageData: String(inline.data),
      mimeType: String(inline.mimeType || inline.mime_type || "image/png"),
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
    "Create a clean educational visual for the current beat of a vertical short lecture.",
    "Style: polished learning slide, precise infographic, blueprint-friendly when useful, crisp shapes, bright background, no UI chrome.",
    "Prioritize conceptual accuracy over painterly style. If this current beat needs a graph, formula, matrix, architecture diagram, table, axis, layer model, or flow chart, make that structure crisp and readable.",
    "Do not make a chapter poster, cover image, big unit title slide, or generic summary image. The image should support exactly what the TTS is saying for this scene.",
    "Composition: pure native tall 9:16 vertical illustration for a 1024x1792 frame, designed for this exact aspect ratio from the start.",
    "Do not create a landscape, square, poster, slide-deck, or wide illustration and adapt it into vertical. Do not rely on later cropping, zooming, padding, or reframing.",
    "Use the full vertical height naturally with a top-to-bottom educational composition.",
    "This is RAW EDUCATIONAL ARTWORK for a web app, NOT a phone screenshot and NOT a complete mobile app screen.",
    "Fill the entire 9:16 canvas with artwork and background. Do not create letterboxing, white poster margins, framed slide borders, phone mockups, screenshots inside a phone, or contain-style padding.",
    "Absolutely do not draw any phone frame, device border, rounded screen, notch, dynamic island, status bar, clock, battery icon, signal icon, Wi-Fi icon, speed button, progress bar, app tab bar, browser chrome, button, overlay, caption box, subtitle strip, or UI element.",
    "The web app will overlay its own phone-like UI on top of this image.",
    "Treat the top 18% of the image as an overlay-safe header zone. In that top 18%, especially the top-center 40% of the image width and the top corners, place only simple natural background, sky, wall, soft color, or non-essential atmosphere.",
    "Never place a face, main character, key diagram node, arrowhead, label, formula, large title, chapter name, or important visual cue in that overlay-safe header zone. Put core teaching action below that header zone.",
    "Do not place important objects, arrows, characters, diagram parts, or visual cues on the extreme edges. Nothing important may be cut off.",
    "Use a small clean breathing margin on all four sides while still filling the full height naturally.",
    `The dominant lesson language is ${dominantLanguageLabel}.`,
    "Short Korean labels, short Korean titles inside diagrams, formulas, axis labels, legends, and concise callouts are allowed when they improve learning accuracy.",
    "Do not render long explanatory prose, paragraphs, logos, watermarks, fake text, or pseudo-text textures. Keep any text short, readable, and proofread-looking.",
    dominantLanguageLabel === "Korean"
      ? "Any label, callout, or short text that appears inside the image must be written in Korean (한글), never in English. Do not render English sentences, phrases, or explanatory captions anywhere. The only exception is math/scientific notation and widely-used Latin abbreviations (e.g. DNA, CPU, pH)."
      : null,
    "Do not render a large top headline, unit title, lesson title, or subsection title. The app renders titles and controls separately.",
    "Do not render a table-of-contents screen, numbered bullet-card list, title page, lesson menu, app fallback card layout, or any image that is mostly text boxes.",
    "Prefer symbols, arrows, objects, colors, formulas, graphs, and clean layout over long rendered text.",
    `Pack topic: ${packTitle}`,
    `Idea: ${ideaTitle}`,
    `Scene focus: ${scene.headline || ""}`,
    `Concept summary: ${scene.body || ""}`,
    callouts ? `Key visual cues: ${callouts}` : null,
    scene.visualStyle ? `Visual style hint: ${scene.visualStyle}` : null,
    scene.layoutHint ? `Layout hint: ${scene.layoutHint}` : null,
    "Make this beat visually distinct from nearby beats: change composition, objects, diagram structure, camera angle, or color emphasis when the idea changes.",
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
  const response = await fetchImpl("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: {
      "x-goog-api-key": config.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      input: [{ type: "text", text: prompt }],
      response_format: {
        type: "image",
        mime_type: "image/jpeg",
        aspect_ratio: "9:16",
        image_size: "1K",
      },
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `Gemini image generation failed: ${data?.error?.message || data?.message || response.statusText}`
    );
  }

  const image = getImageCandidateFromGemini(data);
  const imageData = image?.imageData || "";
  const mimeType = image?.mimeType || "image/png";

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
