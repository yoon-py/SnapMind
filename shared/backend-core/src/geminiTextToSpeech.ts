const DEFAULT_GEMINI_TTS_MODEL = "gemini-2.5-pro-preview-tts";
const DEFAULT_GEMINI_TTS_VOICE = "Kore";
const DEFAULT_GEMINI_TTS_SAMPLE_RATE = 24000;
const DEFAULT_GEMINI_TTS_CHANNELS = 1;
const DEFAULT_GEMINI_TTS_BITS_PER_SAMPLE = 16;

export type GeminiTextToSpeechConfig = {
  apiKey: string;
  model: string;
  voiceName: string;
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

function buildWavFile({
  pcmBytes,
  sampleRate = DEFAULT_GEMINI_TTS_SAMPLE_RATE,
  channels = DEFAULT_GEMINI_TTS_CHANNELS,
  bitsPerSample = DEFAULT_GEMINI_TTS_BITS_PER_SAMPLE,
}: {
  pcmBytes: Uint8Array;
  sampleRate?: number;
  channels?: number;
  bitsPerSample?: number;
}) {
  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const dataLength = pcmBytes.byteLength;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  function writeAscii(offset: number, value: string) {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  }

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(36, "data");
  view.setUint32(40, dataLength, true);
  bytes.set(pcmBytes, 44);

  return bytes;
}

function estimateSceneSegments(
  scenes: Array<{
    id: string;
    order: number;
    narration: string;
  }>,
  durationMs: number
) {
  const weightedScenes = scenes.map((scene) => ({
    ...scene,
    units: Math.max(1, String(scene.narration || "").trim().split(/\s+/).filter(Boolean).length),
  }));
  const totalUnits = weightedScenes.reduce((sum, scene) => sum + scene.units, 0) || 1;

  let cursorMs = 0;
  return weightedScenes.map((scene, index) => {
    const isLast = index === weightedScenes.length - 1;
    const sceneDurationMs = isLast
      ? Math.max(0, durationMs - cursorMs)
      : Math.max(1200, Math.round((durationMs * scene.units) / totalUnits));
    const startMs = cursorMs;
    const endMs = isLast ? durationMs : Math.min(durationMs, cursorMs + sceneDurationMs);
    cursorMs = endMs;

    return {
      id: `${scene.id}-segment`,
      sceneId: scene.id,
      order: scene.order,
      text: scene.narration,
      startMs,
      endMs,
    };
  });
}

export function resolveGeminiTextToSpeechConfig(raw: {
  apiKey?: string;
  model?: string;
  voiceName?: string;
}) {
  const apiKey = String(raw.apiKey || "").trim();
  const model = String(raw.model || DEFAULT_GEMINI_TTS_MODEL).trim() || DEFAULT_GEMINI_TTS_MODEL;
  const voiceName =
    String(raw.voiceName || DEFAULT_GEMINI_TTS_VOICE).trim() || DEFAULT_GEMINI_TTS_VOICE;

  if (!apiKey) {
    return null;
  }

  return {
    apiKey,
    model,
    voiceName,
  } as GeminiTextToSpeechConfig;
}

export function getDefaultGeminiTtsVoice(languageCode: string | undefined) {
  if (languageCode === "ko") {
    return "Kore";
  }

  if (languageCode === "da") {
    return "Orus";
  }

  return DEFAULT_GEMINI_TTS_VOICE;
}

function buildNarrationText(
  scenes: Array<{
    narration: string;
  }>
) {
  return scenes
    .map((scene) => String(scene.narration || "").trim())
    .filter(Boolean)
    .join("\n\n");
}

export async function synthesizeShortAudio({
  config,
  scenes,
  languageCode,
  fetchImpl = fetch,
}: {
  config: GeminiTextToSpeechConfig;
  scenes: Array<{
    id: string;
    order: number;
    narration: string;
  }>;
  languageCode?: string;
  fetchImpl?: typeof fetch;
}) {
  const voiceName = config.voiceName || getDefaultGeminiTtsVoice(languageCode);
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
            parts: [
              {
                text: buildNarrationText(scenes),
              },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName,
              },
            },
          },
        },
      }),
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `Gemini TTS failed: ${data?.error?.message || data?.message || response.statusText}`
    );
  }

  const parts = Array.isArray(data?.candidates?.[0]?.content?.parts)
    ? data.candidates[0].content.parts
    : [];
  const audioPart =
    parts.find((part: any) => part?.inlineData?.data) ||
    parts.find((part: any) => part?.inline_data?.data);
  const audioData = String(audioPart?.inlineData?.data || audioPart?.inline_data?.data || "");
  const mimeType = String(
    audioPart?.inlineData?.mimeType || audioPart?.inline_data?.mime_type || "audio/L16"
  );

  if (!audioData) {
    throw new Error("Gemini TTS did not return audio bytes.");
  }

  const rawBytes = decodeBase64(audioData);
  const sampleRateMatch = mimeType.match(/rate=(\d+)/i);
  const sampleRate = sampleRateMatch ? Number(sampleRateMatch[1]) : DEFAULT_GEMINI_TTS_SAMPLE_RATE;
  const wavBytes =
    /^audio\/wav$/i.test(mimeType) || /^audio\/x-wav$/i.test(mimeType)
      ? rawBytes
      : buildWavFile({
          pcmBytes: rawBytes,
          sampleRate,
        });
  const durationMs = Math.round(
    (rawBytes.byteLength /
      (sampleRate * DEFAULT_GEMINI_TTS_CHANNELS * (DEFAULT_GEMINI_TTS_BITS_PER_SAMPLE / 8))) *
      1000
  );
  const segments = estimateSceneSegments(scenes, durationMs);

  return {
    audioBytes: wavBytes,
    mimeType: "audio/wav",
    fileExtension: "wav",
    voiceLabel: voiceName,
    durationMs,
    model: config.model,
    segments,
  };
}
