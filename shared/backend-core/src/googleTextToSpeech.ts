const GOOGLE_OAUTH_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const GOOGLE_OAUTH_AUDIENCE = "https://oauth2.googleapis.com/token";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

const googleAccessTokenCache = new Map<
  string,
  {
    accessToken: string;
    expiresAtMs: number;
  }
>();

export type GoogleTextToSpeechConfig = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  privateKeyId?: string;
};

function normalizeMultilineSecret(value: string | undefined) {
  return String(value || "").replace(/\\n/g, "\n").trim();
}

function safeJsonParse(value: string | undefined) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toBase64(bytes: Uint8Array) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }

  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

function fromBase64(base64: string) {
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

function toBase64Url(bytes: Uint8Array) {
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function encodeJsonSegment(value: unknown) {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function decodePemPrivateKey(privateKey: string) {
  const normalized = privateKey
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");

  if (!normalized) {
    throw new Error("Google service account private key is empty.");
  }

  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(normalized, "base64"));
  }

  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function signJwtAssertion({
  clientEmail,
  privateKey,
  privateKeyId,
}: Pick<GoogleTextToSpeechConfig, "clientEmail" | "privateKey" | "privateKeyId">) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = {
    alg: "RS256",
    typ: "JWT",
    ...(privateKeyId ? { kid: privateKeyId } : {}),
  };
  const payload = {
    iss: clientEmail,
    scope: GOOGLE_OAUTH_SCOPE,
    aud: GOOGLE_OAUTH_AUDIENCE,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  };

  const signingInput = `${encodeJsonSegment(header)}.${encodeJsonSegment(payload)}`;
  const keyData = decodePemPrivateKey(privateKey);
  const importedKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData.buffer.slice(keyData.byteOffset, keyData.byteOffset + keyData.byteLength),
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    importedKey,
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${toBase64Url(new Uint8Array(signature))}`;
}

export function resolveGoogleTextToSpeechConfig(raw: {
  projectId?: string;
  clientEmail?: string;
  privateKey?: string;
  privateKeyId?: string;
  serviceAccountJson?: string;
}) {
  const parsedServiceAccount = safeJsonParse(raw.serviceAccountJson);
  const config = {
    projectId: String(raw.projectId || parsedServiceAccount?.project_id || "").trim(),
    clientEmail: String(raw.clientEmail || parsedServiceAccount?.client_email || "").trim(),
    privateKey: normalizeMultilineSecret(raw.privateKey || parsedServiceAccount?.private_key),
    privateKeyId: String(raw.privateKeyId || parsedServiceAccount?.private_key_id || "").trim(),
  };

  if (!config.projectId || !config.clientEmail || !config.privateKey) {
    return null;
  }

  return config as GoogleTextToSpeechConfig;
}

async function getGoogleAccessToken(
  config: GoogleTextToSpeechConfig,
  fetchImpl: typeof fetch = fetch
) {
  const cacheKey = `${config.clientEmail}:${config.projectId}:tts`;
  const cached = googleAccessTokenCache.get(cacheKey);

  if (cached && cached.expiresAtMs > Date.now() + 60_000) {
    return cached.accessToken;
  }

  const assertion = await signJwtAssertion(config);
  const response = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.access_token) {
    throw new Error(
      `Google OAuth token request failed: ${data?.error_description || data?.error || response.statusText}`
    );
  }

  const expiresAtMs = Date.now() + Number(data.expires_in || 3600) * 1000;
  googleAccessTokenCache.set(cacheKey, { accessToken: data.access_token, expiresAtMs });

  return data.access_token as string;
}

export function getDefaultGoogleTtsVoice(languageCode: string | undefined) {
  if (languageCode === "ko") {
    return {
      label: "ko-KR / FEMALE",
      voice: {
        languageCode: "ko-KR",
        ssmlGender: "FEMALE",
      },
    };
  }

  if (languageCode === "da") {
    return {
      label: "da-DK / FEMALE",
      voice: {
        languageCode: "da-DK",
        ssmlGender: "FEMALE",
      },
    };
  }

  return {
    label: "en-US / FEMALE",
    voice: {
      languageCode: "en-US",
      ssmlGender: "FEMALE",
    },
  };
}

function escapeSsml(text: string) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildShortSceneSsml(
  scenes: Array<{
    id: string;
    order: number;
    narration: string;
  }>
) {
  const orderedScenes = [...scenes].sort((left, right) => left.order - right.order);
  const ssmlBody = orderedScenes
    .map((scene) => {
      const safeNarration = escapeSsml(scene.narration);
      return `<mark name="${scene.id}-start"/>${safeNarration}<mark name="${scene.id}-end"/>`;
    })
    .join('<break time="400ms"/>');

  return `<speak>${ssmlBody}</speak>`;
}

export async function synthesizeShortAudio({
  config,
  scenes,
  languageCode,
  fetchImpl = fetch,
}: {
  config: GoogleTextToSpeechConfig;
  scenes: Array<{
    id: string;
    order: number;
    narration: string;
  }>;
  languageCode?: string;
  fetchImpl?: typeof fetch;
}) {
  const accessToken = await getGoogleAccessToken(config, fetchImpl);
  const voicePreset = getDefaultGoogleTtsVoice(languageCode);
  const response = await fetchImpl("https://texttospeech.googleapis.com/v1beta1/text:synthesize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      input: {
        ssml: buildShortSceneSsml(scenes),
      },
      voice: voicePreset.voice,
      audioConfig: {
        audioEncoding: "MP3",
        speakingRate: 1,
      },
      enableTimePointing: ["SSML_MARK"],
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.audioContent) {
    throw new Error(
      `Google Text-to-Speech failed: ${data?.error?.message || data?.message || response.statusText}`
    );
  }

  const timepoints = Array.isArray(data.timepoints) ? data.timepoints : [];
  const timepointMap = new Map<string, number>();
  timepoints.forEach((timepoint: any) => {
    const seconds = Number(timepoint?.timeSeconds || 0);
    if (timepoint?.markName) {
      timepointMap.set(String(timepoint.markName), Math.round(seconds * 1000));
    }
  });

  const segments = scenes
    .map((scene) => ({
      id: `${scene.id}-segment`,
      sceneId: scene.id,
      order: scene.order,
      text: scene.narration,
      startMs: Math.max(0, Number(timepointMap.get(`${scene.id}-start`) || 0)),
      endMs: Math.max(0, Number(timepointMap.get(`${scene.id}-end`) || 0)),
    }))
    .sort((left, right) => left.order - right.order);

  const durationMs = segments.reduce((max, segment) => Math.max(max, segment.endMs), 0);

  return {
    audioBytes: fromBase64(String(data.audioContent || "")),
    voiceLabel: voicePreset.label,
    durationMs,
    segments,
  };
}
