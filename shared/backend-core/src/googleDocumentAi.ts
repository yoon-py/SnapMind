const GOOGLE_OAUTH_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const GOOGLE_OAUTH_AUDIENCE = "https://oauth2.googleapis.com/token";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const GOOGLE_DOCUMENT_AI_MAX_ONLINE_PDF_PAGES = 30;

const googleAccessTokenCache = new Map<
  string,
  {
    accessToken: string;
    expiresAtMs: number;
  }
>();

export type GoogleDocumentAiConfig = {
  projectId: string;
  location: string;
  processorId: string;
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

export function resolveGoogleDocumentAiConfig(raw: {
  projectId?: string;
  location?: string;
  processorId?: string;
  clientEmail?: string;
  privateKey?: string;
  privateKeyId?: string;
  serviceAccountJson?: string;
}) {
  const parsedServiceAccount = safeJsonParse(raw.serviceAccountJson);

  const config = {
    projectId: String(raw.projectId || parsedServiceAccount?.project_id || "").trim(),
    location: String(raw.location || parsedServiceAccount?.location || "us").trim() || "us",
    processorId: String(raw.processorId || parsedServiceAccount?.processor_id || "").trim(),
    clientEmail: String(raw.clientEmail || parsedServiceAccount?.client_email || "").trim(),
    privateKey: normalizeMultilineSecret(raw.privateKey || parsedServiceAccount?.private_key),
    privateKeyId: String(raw.privateKeyId || parsedServiceAccount?.private_key_id || "").trim(),
  };

  if (!config.projectId || !config.processorId || !config.clientEmail || !config.privateKey) {
    return null;
  }

  return config as GoogleDocumentAiConfig;
}

export function supportsGoogleDocumentAiMimeType(mimeType: string | null | undefined) {
  const normalized = String(mimeType || "").toLowerCase().trim();
  return new Set([
    "application/pdf",
    "image/bmp",
    "image/gif",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/tiff",
    "image/tif",
    "image/webp",
  ]).has(normalized);
}

export function buildGoogleDocumentAiPageChunks(
  totalPages: number,
  chunkSize = GOOGLE_DOCUMENT_AI_MAX_ONLINE_PDF_PAGES
) {
  const resolvedTotalPages = Number(totalPages);
  const resolvedChunkSize = Math.max(1, Number(chunkSize) || GOOGLE_DOCUMENT_AI_MAX_ONLINE_PDF_PAGES);

  if (!Number.isFinite(resolvedTotalPages) || resolvedTotalPages <= 0) {
    return [];
  }

  const chunks: number[][] = [];

  for (let start = 1; start <= resolvedTotalPages; start += resolvedChunkSize) {
    const end = Math.min(resolvedTotalPages, start + resolvedChunkSize - 1);
    const pages: number[] = [];

    for (let page = start; page <= end; page += 1) {
      pages.push(page);
    }

    chunks.push(pages);
  }

  return chunks;
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
}: Pick<GoogleDocumentAiConfig, "clientEmail" | "privateKey" | "privateKeyId">) {
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

  const encodedHeader = encodeJsonSegment(header);
  const encodedPayload = encodeJsonSegment(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
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

export async function getGoogleAccessToken(
  config: GoogleDocumentAiConfig,
  fetchImpl: typeof fetch = fetch
) {
  const cacheKey = `${config.clientEmail}:${config.projectId}:${config.processorId}`;
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
  googleAccessTokenCache.set(cacheKey, {
    accessToken: data.access_token,
    expiresAtMs,
  });

  return data.access_token as string;
}

export async function extractTextWithGoogleDocumentAi({
  buffer,
  config,
  fetchImpl = fetch,
  fileName,
  mimeType,
  pageNumbers,
}: {
  buffer: ArrayBuffer | Uint8Array;
  config: GoogleDocumentAiConfig;
  fetchImpl?: typeof fetch;
  fileName?: string;
  mimeType: string;
  pageNumbers?: number[];
}) {
  const accessToken = await getGoogleAccessToken(config, fetchImpl);
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const isPdf = mimeType === "application/pdf";
  const response = await fetchImpl(
    `https://${config.location}-documentai.googleapis.com/v1/projects/${config.projectId}/locations/${config.location}/processors/${config.processorId}:process`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        skipHumanReview: true,
        imagelessMode: isPdf,
        rawDocument: {
          mimeType,
          content: toBase64(bytes),
          displayName: fileName || "document",
        },
        fieldMask: "text",
        processOptions: {
          ...(Array.isArray(pageNumbers) && pageNumbers.length > 0
            ? {
                individualPageSelector: {
                  pages: pageNumbers,
                },
              }
            : {}),
          ocrConfig: {
            enableNativePdfParsing: isPdf,
          },
        },
      }),
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      `Google Document AI OCR failed: ${data?.error?.message || data?.message || response.statusText}`
    );
  }

  return String(data?.document?.text || "");
}
