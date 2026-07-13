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

function extractPcmFromTtsResponse(data: any): { pcmBytes: Uint8Array; sampleRate: number; mimeType: string } {
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
  const pcmBytes =
    /^audio\/wav$/i.test(mimeType) || /^audio\/x-wav$/i.test(mimeType)
      ? rawBytes.subarray(44)
      : rawBytes;

  return { pcmBytes, sampleRate, mimeType };
}

function pcmDurationMs(byteLength: number, sampleRate: number) {
  return Math.round(
    (byteLength /
      (sampleRate * DEFAULT_GEMINI_TTS_CHANNELS * (DEFAULT_GEMINI_TTS_BITS_PER_SAMPLE / 8))) *
      1000
  );
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

const TTS_FALLBACK_MODELS = [
  "gemini-2.5-flash-preview-tts",
  "gemini-2.5-pro-preview-tts",
  "gemini-3.1-flash-tts-preview",
];

async function synthesizeWithRetry(
  apiKey: string,
  model: string,
  body: string,
  fetchImpl: typeof fetch,
  maxAttempts = 4
): Promise<any> {
  const fallbackModels = [model, ...TTS_FALLBACK_MODELS.filter((m) => m !== model)];
  let lastError: Error | undefined;

  for (const modelId of fallbackModels) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30000);
        const response = await fetchImpl(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: controller.signal }
        );
        clearTimeout(timer);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(`Gemini TTS failed: ${data?.error?.message || response.statusText}`);
        }
        return data;
      } catch (err: any) {
        lastError = err;
        const isRetryable =
          err.message?.includes("high demand") ||
          err.message?.includes("fetch failed") ||
          err.message?.includes("503") ||
          err.message?.includes("overloaded") ||
          err.message?.includes("aborted") ||
          err.name === "AbortError";
        if (!isRetryable) throw err;
        if (attempt < maxAttempts) {
          const delay = Math.min(1000 * 2 ** (attempt - 1), 8000);
          console.warn(`[tts-retry ${attempt}/${maxAttempts}] ${modelId}: ${err.message} — waiting ${delay}ms`);
          await new Promise((r) => setTimeout(r, delay));
        } else {
          console.warn(`[tts-fallback] ${modelId} unavailable, trying next...`);
        }
      }
    }
  }
  throw lastError;
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
  const SCENE_CONCURRENCY = Math.max(1, Number(process.env.SHORTS_SCENE_TTS_CONCURRENCY) || 2);
  const SILENCE_BETWEEN_SCENES_MS = Math.max(0, Number(process.env.SHORTS_SCENE_SILENCE_MS) || 250);

  type SceneAudio = { pcmBytes: Uint8Array; sampleRate: number; durationMs: number };
  const sceneAudios: SceneAudio[] = new Array(scenes.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const idx = nextIndex;
      nextIndex += 1;
      if (idx >= scenes.length) {
        return;
      }
      const scene = scenes[idx];
      const narration = String(scene.narration || "").trim();
      if (!narration) {
        sceneAudios[idx] = {
          pcmBytes: new Uint8Array(0),
          sampleRate: DEFAULT_GEMINI_TTS_SAMPLE_RATE,
          durationMs: 0,
        };
        continue;
      }

      const requestBody = JSON.stringify({
        contents: [{ parts: [{ text: narration }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
        },
      });
      const data = await synthesizeWithRetry(config.apiKey, config.model, requestBody, fetchImpl);
      const { pcmBytes, sampleRate } = extractPcmFromTtsResponse(data);
      sceneAudios[idx] = {
        pcmBytes,
        sampleRate,
        durationMs: pcmDurationMs(pcmBytes.byteLength, sampleRate),
      };
    }
  }

  const workerCount = Math.min(SCENE_CONCURRENCY, scenes.length);
  await Promise.all(Array.from({ length: workerCount }, worker));

  const masterSampleRate =
    sceneAudios.find((a) => a.pcmBytes.byteLength > 0)?.sampleRate || DEFAULT_GEMINI_TTS_SAMPLE_RATE;

  const bytesPerMs =
    (masterSampleRate * DEFAULT_GEMINI_TTS_CHANNELS * (DEFAULT_GEMINI_TTS_BITS_PER_SAMPLE / 8)) /
    1000;
  const silenceByteCount =
    Math.round(bytesPerMs * SILENCE_BETWEEN_SCENES_MS) *
    1; // already in bytes
  const silenceBuffer = new Uint8Array(silenceByteCount);
  const silenceDurationMs =
    silenceByteCount > 0 ? Math.round(silenceByteCount / bytesPerMs) : 0;

  const segments: Array<{
    id: string;
    sceneId: string;
    order: number;
    text: string;
    startMs: number;
    endMs: number;
  }> = [];
  const chunks: Uint8Array[] = [];
  let cursorMs = 0;

  for (let i = 0; i < scenes.length; i += 1) {
    const scene = scenes[i];
    const audio = sceneAudios[i];
    const startMs = cursorMs;
    const endMs = startMs + audio.durationMs;
    if (audio.pcmBytes.byteLength > 0) {
      chunks.push(audio.pcmBytes);
    }

    segments.push({
      id: `${scene.id}-segment`,
      sceneId: scene.id,
      order: scene.order,
      text: scene.narration,
      startMs,
      endMs,
    });

    cursorMs = endMs;

    if (i < scenes.length - 1 && silenceByteCount > 0) {
      chunks.push(silenceBuffer);
      cursorMs += silenceDurationMs;
    }
  }

  const totalLength = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const concatPcm = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    concatPcm.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const wavBytes = buildWavFile({
    pcmBytes: concatPcm,
    sampleRate: masterSampleRate,
  });

  return {
    audioBytes: wavBytes,
    mimeType: "audio/wav",
    fileExtension: "wav",
    voiceLabel: voiceName,
    durationMs: cursorMs,
    model: config.model,
    segments,
  };
}
