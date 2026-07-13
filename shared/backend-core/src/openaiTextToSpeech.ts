const DEFAULT_OPENAI_TTS_MODEL = "gpt-4o-mini-tts";
const DEFAULT_OPENAI_TTS_VOICE = "coral";
const DEFAULT_WORDS_PER_MINUTE = 155;

export type OpenAITextToSpeechConfig = {
  apiKey: string;
  model: string;
  voiceName: string;
};

export function resolveOpenAITextToSpeechConfig(raw: {
  apiKey?: string;
  model?: string;
  voiceName?: string;
}) {
  const apiKey = String(raw.apiKey || "").trim();
  const model = String(raw.model || DEFAULT_OPENAI_TTS_MODEL).trim() || DEFAULT_OPENAI_TTS_MODEL;
  const voiceName = String(raw.voiceName || DEFAULT_OPENAI_TTS_VOICE).trim() || DEFAULT_OPENAI_TTS_VOICE;

  if (!apiKey) {
    return null;
  }

  return {
    apiKey,
    model,
    voiceName,
  } as OpenAITextToSpeechConfig;
}

export function getDefaultOpenAITtsVoice(languageCode: string | undefined) {
  if (languageCode === "ko") {
    return "cedar";
  }

  return DEFAULT_OPENAI_TTS_VOICE;
}

function encodeBase64(bytes: Uint8Array) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }

  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function estimateSpeechDurationMs(text: string) {
  const wordCount = Math.max(1, (text.match(/\S+/g) || []).length);
  const commaPauseCount = (text.match(/[,.!?;:，。！？；：]/g) || []).length;
  const spokenMs = Math.round((wordCount / DEFAULT_WORDS_PER_MINUTE) * 60 * 1000);
  return Math.max(900, spokenMs + commaPauseCount * 120);
}

function buildInputText(
  scenes: Array<{
    id: string;
    order: number;
    narration: string;
  }>
) {
  return scenes
    .map((scene) => String(scene.narration || "").trim())
    .filter(Boolean)
    .join("\n\n");
}

async function synthesizeSpeechBytes({
  config,
  input,
  instructions,
  fetchImpl,
}: {
  config: OpenAITextToSpeechConfig;
  input: string;
  instructions: string;
  fetchImpl: typeof fetch;
}) {
  const response = await fetchImpl("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      voice: config.voiceName,
      input,
      instructions,
      response_format: "mp3",
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(`OpenAI TTS failed: ${data?.error?.message || response.statusText}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

export async function synthesizeShortAudioWithOpenAI({
  config,
  scenes,
  languageCode,
  fetchImpl = fetch,
}: {
  config: OpenAITextToSpeechConfig;
  scenes: Array<{
    id: string;
    order: number;
    narration: string;
  }>;
  languageCode?: string;
  fetchImpl?: typeof fetch;
}) {
  const voiceName = config.voiceName || getDefaultOpenAITtsVoice(languageCode);
  const resolvedConfig = { ...config, voiceName };
  const input = buildInputText(scenes);

  if (!input) {
    throw new Error("No narration available for TTS.");
  }

  const instructions =
    languageCode === "ko"
      ? "Speak as a calm Korean tutor. Use clear pronunciation, natural pacing, and a warm explanatory tone."
      : "Speak as a calm tutor. Use clear pronunciation, natural pacing, and a warm explanatory tone.";

  const audioBytes = await synthesizeSpeechBytes({
    config: resolvedConfig,
    input,
    instructions,
    fetchImpl,
  });

  const sceneDurations = scenes.map((scene) => estimateSpeechDurationMs(scene.narration || ""));
  const totalEstimatedDuration = sceneDurations.reduce((sum, duration) => sum + duration, 0);

  const segments: Array<{
    id: string;
    sceneId: string;
    order: number;
    text: string;
    startMs: number;
    endMs: number;
  }> = [];
  let cursorMs = 0;

  scenes.forEach((scene, index) => {
    const startMs = cursorMs;
    const endMs = startMs + sceneDurations[index];
    segments.push({
      id: `${scene.id}-segment`,
      sceneId: scene.id,
      order: scene.order,
      text: scene.narration,
      startMs,
      endMs,
    });
    cursorMs = endMs;
  });

  return {
    audioBytes,
    audioDataUrl: `data:audio/mpeg;base64,${encodeBase64(audioBytes)}`,
    mimeType: "audio/mpeg",
    fileExtension: "mp3",
    voiceLabel: voiceName,
    durationMs: totalEstimatedDuration,
    model: config.model,
    segments,
  };
}
