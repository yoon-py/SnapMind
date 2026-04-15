import mammoth from "mammoth";
import * as XLSX from "xlsx";
import officeparser from "officeparser";

import { normalizeSourceMaterialText } from "../../shared/backend-core/dist/esm/text.js";
import {
  buildGoogleDocumentAiPageChunks,
  extractTextWithGoogleDocumentAi,
  GOOGLE_DOCUMENT_AI_MAX_ONLINE_PDF_PAGES,
  resolveGoogleDocumentAiConfig,
  supportsGoogleDocumentAiMimeType,
} from "../../shared/backend-core/dist/esm/googleDocumentAi.js";

let pdfParseModulePromise = null;

function resolveWorkerGoogleDocumentAiConfig(env) {
  return resolveGoogleDocumentAiConfig({
    projectId: env?.GOOGLE_DOCUMENT_AI_PROJECT_ID,
    location: env?.GOOGLE_DOCUMENT_AI_LOCATION,
    processorId: env?.GOOGLE_DOCUMENT_AI_PROCESSOR_ID,
    clientEmail: env?.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL,
    privateKey: env?.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
    privateKeyId: env?.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_ID,
    serviceAccountJson: env?.GOOGLE_SERVICE_ACCOUNT_JSON,
  });
}

function getWorkerOcrProvider(env) {
  return String(env?.OCR_PROVIDER || "auto").toLowerCase();
}

export function getUploadFileExtension(file) {
  return String(file.originalname || "").toLowerCase().split(".").pop() || "";
}

export function isPdfUpload(file) {
  if (!file) return false;
  return file.mimetype === "application/pdf" || getUploadFileExtension(file) === "pdf";
}

function isDocxUpload(file) {
  if (!file) return false;
  return (
    file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    getUploadFileExtension(file) === "docx"
  );
}

function isHwpUpload(file) {
  if (!file) return false;
  return (
    file.mimetype === "application/x-hwp" ||
    file.mimetype === "application/haansofthwp" ||
    getUploadFileExtension(file) === "hwp"
  );
}

function isHwpxUpload(file) {
  if (!file) return false;
  return (
    file.mimetype === "application/hwp+zip" ||
    file.mimetype === "application/vnd.hancom.hwpx" ||
    getUploadFileExtension(file) === "hwpx"
  );
}

function isPptxUpload(file) {
  if (!file) return false;
  return (
    file.mimetype === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    file.mimetype === "application/vnd.ms-powerpoint" ||
    ["pptx", "ppt"].includes(getUploadFileExtension(file))
  );
}

function isXlsxUpload(file) {
  if (!file) return false;
  return (
    file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.mimetype === "application/vnd.ms-excel" ||
    ["xlsx", "xls"].includes(getUploadFileExtension(file))
  );
}

export function isImageUpload(file) {
  if (!file) return false;
  const ext = getUploadFileExtension(file);
  const imageExtensions = new Set(["jpg", "jpeg", "png", "webp", "bmp", "tiff", "tif"]);
  return imageExtensions.has(ext) || (file.mimetype && file.mimetype.startsWith("image/"));
}

function isTextBasedUpload(file) {
  if (!file) return false;
  const ext = getUploadFileExtension(file);
  const textExtensions = new Set(["txt", "md", "markdown", "csv", "json", "html", "htm", "xml", "rtf"]);
  return textExtensions.has(ext) || (file.mimetype && file.mimetype.startsWith("text/"));
}

export function isSupportedUpload(file) {
  return (
    isPdfUpload(file) ||
    isDocxUpload(file) ||
    isHwpUpload(file) ||
    isHwpxUpload(file) ||
    isPptxUpload(file) ||
    isXlsxUpload(file) ||
    isImageUpload(file) ||
    isTextBasedUpload(file)
  );
}

async function extractTextViaUpstage(buffer, mimeType, fileName, upstageApiKey) {
  if (!upstageApiKey) {
    throw new Error("UPSTAGE_API_KEY is missing. Cannot perform document parsing.");
  }

  const formData = new FormData();
  formData.append("document", new Blob([buffer], { type: mimeType }), fileName);
  formData.append("ocr", "force");

  const response = await fetch("https://api.upstage.ai/v1/document-ai/document-parse", {
    method: "POST",
    headers: { Authorization: `Bearer ${upstageApiKey}` },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Upstage document parse failed: ${error?.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const html = data?.content?.html || "";

  const text = html
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<\/p>/g, "\n\n")
    .replace(/<\/h[1-6]>/g, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/(\d)\s+(장|부|과|절|편)/g, "$1$2")
    .replace(/(\d)\s+(\d)(장|부|과|절|편)/g, "$1$2$3")
    .trim();

  return normalizeSourceMaterialText(text);
}

async function extractTextViaConfiguredOcr(buffer, mimeType, fileName, env, options = {}) {
  const ocrProvider = getWorkerOcrProvider(env);
  const googleConfig = resolveWorkerGoogleDocumentAiConfig(env);

  if (
    (ocrProvider === "auto" || ocrProvider === "google_document_ai") &&
    googleConfig &&
    supportsGoogleDocumentAiMimeType(mimeType)
  ) {
    try {
      const totalPages = Number(options.totalPages);
      let text = "";

      if (
        mimeType === "application/pdf" &&
        Number.isFinite(totalPages) &&
        totalPages > GOOGLE_DOCUMENT_AI_MAX_ONLINE_PDF_PAGES
      ) {
        const pageChunks = buildGoogleDocumentAiPageChunks(
          totalPages,
          GOOGLE_DOCUMENT_AI_MAX_ONLINE_PDF_PAGES
        );
        const parts = [];

        for (const pages of pageChunks) {
          const chunkText = await extractTextWithGoogleDocumentAi({
            buffer,
            config: googleConfig,
            fileName,
            mimeType,
            pageNumbers: pages,
          });
          parts.push(chunkText);
        }

        text = parts.join("\n\n");
      } else {
        text = await extractTextWithGoogleDocumentAi({
          buffer,
          config: googleConfig,
          fileName,
          mimeType,
        });
      }

      return normalizeSourceMaterialText(text);
    } catch (error) {
      if (ocrProvider === "google_document_ai") {
        throw error;
      }

      console.warn(
        `OCR: Google Cloud Document AI failed, falling back to Upstage. ${error.message}`
      );
    }
  }

  if (ocrProvider === "google_document_ai" && !googleConfig) {
    throw new Error("Google Document AI is selected, but GOOGLE_DOCUMENT_AI_* credentials are incomplete.");
  }

  return extractTextViaUpstage(buffer, mimeType, fileName, env?.UPSTAGE_API_KEY);
}

class WorkerDOMPoint {
  constructor(x = 0, y = 0, z = 0, w = 1) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }
}

class WorkerDOMMatrix {
  constructor(init) {
    this.a = 1;
    this.b = 0;
    this.c = 0;
    this.d = 1;
    this.e = 0;
    this.f = 0;

    if (Array.isArray(init)) {
      if (init.length >= 6) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = init;
      }
    } else if (init && typeof init === "object") {
      this.a = Number(init.a ?? init.m11 ?? this.a);
      this.b = Number(init.b ?? init.m12 ?? this.b);
      this.c = Number(init.c ?? init.m21 ?? this.c);
      this.d = Number(init.d ?? init.m22 ?? this.d);
      this.e = Number(init.e ?? init.m41 ?? this.e);
      this.f = Number(init.f ?? init.m42 ?? this.f);
    }
  }

  get is2D() {
    return true;
  }

  get m11() {
    return this.a;
  }
  set m11(value) {
    this.a = value;
  }

  get m12() {
    return this.b;
  }
  set m12(value) {
    this.b = value;
  }

  get m21() {
    return this.c;
  }
  set m21(value) {
    this.c = value;
  }

  get m22() {
    return this.d;
  }
  set m22(value) {
    this.d = value;
  }

  get m41() {
    return this.e;
  }
  set m41(value) {
    this.e = value;
  }

  get m42() {
    return this.f;
  }
  set m42(value) {
    this.f = value;
  }

  multiplySelf(other) {
    const matrix = other instanceof WorkerDOMMatrix ? other : new WorkerDOMMatrix(other);
    const nextA = this.a * matrix.a + this.c * matrix.b;
    const nextB = this.b * matrix.a + this.d * matrix.b;
    const nextC = this.a * matrix.c + this.c * matrix.d;
    const nextD = this.b * matrix.c + this.d * matrix.d;
    const nextE = this.a * matrix.e + this.c * matrix.f + this.e;
    const nextF = this.b * matrix.e + this.d * matrix.f + this.f;

    this.a = nextA;
    this.b = nextB;
    this.c = nextC;
    this.d = nextD;
    this.e = nextE;
    this.f = nextF;
    return this;
  }

  preMultiplySelf(other) {
    const matrix = other instanceof WorkerDOMMatrix ? other : new WorkerDOMMatrix(other);
    const nextA = matrix.a * this.a + matrix.c * this.b;
    const nextB = matrix.b * this.a + matrix.d * this.b;
    const nextC = matrix.a * this.c + matrix.c * this.d;
    const nextD = matrix.b * this.c + matrix.d * this.d;
    const nextE = matrix.a * this.e + matrix.c * this.f + matrix.e;
    const nextF = matrix.b * this.e + matrix.d * this.f + matrix.f;

    this.a = nextA;
    this.b = nextB;
    this.c = nextC;
    this.d = nextD;
    this.e = nextE;
    this.f = nextF;
    return this;
  }

  translateSelf(tx = 0, ty = 0) {
    return this.multiplySelf({ a: 1, b: 0, c: 0, d: 1, e: tx, f: ty });
  }

  scaleSelf(scaleX = 1, scaleY = scaleX, _scaleZ = 1, originX = 0, originY = 0) {
    if (originX || originY) {
      this.translateSelf(originX, originY);
    }

    this.multiplySelf({ a: scaleX, b: 0, c: 0, d: scaleY, e: 0, f: 0 });

    if (originX || originY) {
      this.translateSelf(-originX, -originY);
    }

    return this;
  }

  rotateSelf(_rotX = 0, _rotY = 0, rotZ = 0) {
    const angle = (rotZ || 0) * (Math.PI / 180);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return this.multiplySelf({ a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 });
  }

  invertSelf() {
    const determinant = this.a * this.d - this.b * this.c;

    if (!determinant) {
      this.a = Number.NaN;
      this.b = Number.NaN;
      this.c = Number.NaN;
      this.d = Number.NaN;
      this.e = Number.NaN;
      this.f = Number.NaN;
      return this;
    }

    const nextA = this.d / determinant;
    const nextB = -this.b / determinant;
    const nextC = -this.c / determinant;
    const nextD = this.a / determinant;
    const nextE = (this.c * this.f - this.d * this.e) / determinant;
    const nextF = (this.b * this.e - this.a * this.f) / determinant;

    this.a = nextA;
    this.b = nextB;
    this.c = nextC;
    this.d = nextD;
    this.e = nextE;
    this.f = nextF;
    return this;
  }

  transformPoint(point = new WorkerDOMPoint()) {
    return new WorkerDOMPoint(
      point.x * this.a + point.y * this.c + this.e,
      point.x * this.b + point.y * this.d + this.f,
      point.z || 0,
      point.w || 1
    );
  }

  toFloat64Array() {
    return new Float64Array([this.a, this.b, this.c, this.d, this.e, this.f]);
  }
}

function ensurePdfJsPolyfills() {
  if (typeof globalThis.DOMMatrix === "undefined") {
    globalThis.DOMMatrix = WorkerDOMMatrix;
  }

  if (typeof globalThis.DOMPoint === "undefined") {
    globalThis.DOMPoint = WorkerDOMPoint;
  }
}

async function loadPdfParse() {
  ensurePdfJsPolyfills();

  if (!pdfParseModulePromise) {
    pdfParseModulePromise = import("pdf-parse");
  }

  return pdfParseModulePromise;
}

export function isExtractedTextMeaningful(text) {
  const stripped = text
    .replace(/--\s*\d+\s*of\s*\d+\s*--/g, "")
    .replace(/\s+/g, "")
    .trim();
  return stripped.length >= 100;
}

function getMeaningfulTextLength(text) {
  return String(text || "")
    .replace(/--\s*\d+\s*of\s*\d+\s*--/g, "")
    .replace(/\s+/g, "")
    .trim().length;
}

export function assessPdfTextCoverage({ text, totalPages, pages }) {
  const pageEntries = Array.isArray(pages) ? pages : [];
  const resolvedTotalPages =
    Number.isFinite(totalPages) && Number(totalPages) > 0
      ? Number(totalPages)
      : Math.max(pageEntries.length, 1);
  const pageTextLengths = pageEntries.map((page) => getMeaningfulTextLength(page?.text || ""));
  const meaningfulPages = pageTextLengths.filter((length) => length >= 80).length;
  const sparsePages = pageTextLengths.filter((length) => length < 30).length;
  const totalMeaningfulChars = getMeaningfulTextLength(text);
  const avgMeaningfulCharsPerPage = totalMeaningfulChars / Math.max(resolvedTotalPages, 1);

  let trailingSparsePages = 0;
  for (let index = pageTextLengths.length - 1; index >= 0; index -= 1) {
    if (pageTextLengths[index] < 30) {
      trailingSparsePages += 1;
      continue;
    }
    break;
  }

  const reasons = [];

  if (pageEntries.length > 0 && pageEntries.length < resolvedTotalPages) {
    reasons.push(`parsed only ${pageEntries.length}/${resolvedTotalPages} pages`);
  }

  if (pageTextLengths.length > 0) {
    if (resolvedTotalPages >= 5 && meaningfulPages <= 2) {
      reasons.push(`only ${meaningfulPages} meaningful pages detected in a ${resolvedTotalPages}-page PDF`);
    }

    if (resolvedTotalPages >= 4 && meaningfulPages < Math.max(3, Math.ceil(resolvedTotalPages * 0.6))) {
      reasons.push(`only ${meaningfulPages}/${resolvedTotalPages} pages contain meaningful text`);
    }

    if (resolvedTotalPages >= 4 && trailingSparsePages >= 2) {
      reasons.push(`${trailingSparsePages} sparse trailing pages after extracted text`);
    }

    if (resolvedTotalPages >= 6 && sparsePages >= Math.ceil(resolvedTotalPages * 0.4)) {
      reasons.push(`${sparsePages}/${resolvedTotalPages} pages look sparse or empty`);
    }
  }

  if (resolvedTotalPages >= 6 && avgMeaningfulCharsPerPage < 120) {
    reasons.push(`average extracted text is only ${Math.round(avgMeaningfulCharsPerPage)} chars/page`);
  }

  return {
    suspicious: reasons.length > 0,
    reasons,
    totalPages: resolvedTotalPages,
    meaningfulPages,
    sparsePages,
    trailingSparsePages,
    avgMeaningfulCharsPerPage,
  };
}

export function assessExtractedTextQuality(text) {
  if (!text || text.trim().length === 0) {
    return { ok: false, reason: "empty" };
  }

  const chars = [...text.replace(/\s+/g, "")];
  if (chars.length === 0) return { ok: false, reason: "empty" };

  const garbageRe = /[\uFFFD\uFFFE\uFFFF\u0000-\u0008\u000E-\u001F\uE000-\uF8FF]/;
  const garbageCount = chars.filter((char) => garbageRe.test(char)).length;
  const garbageRatio = garbageCount / chars.length;

  if (garbageRatio > 0.15) {
    return { ok: false, reason: "garbled" };
  }

  const wordCharRe = /[\p{L}]/u;
  const wordCharCount = chars.filter((char) => wordCharRe.test(char)).length;
  const wordCharRatio = wordCharCount / chars.length;

  if (wordCharRatio < 0.3) {
    return { ok: false, reason: "garbled" };
  }

  const wordTokens = text.match(/[\p{L}]{2,}/gu) || [];
  if (wordTokens.length < 5) {
    return { ok: false, reason: "garbled" };
  }

  return { ok: true };
}

async function extractSourceTextFromPdf(file, env) {
  const { PDFParse } = await loadPdfParse();
  const parser = new PDFParse({ data: file.buffer });
  let totalPages;

  try {
    const result = await parser.getText();
    totalPages = result.total;
    const text = normalizeSourceMaterialText(result.text);
    const coverage = assessPdfTextCoverage({
      text,
      totalPages: result.total,
      pages: result.pages,
    });

    if (isExtractedTextMeaningful(text) && !coverage.suspicious) {
      return text;
    }
  } catch (_) {
    // Fall back to OCR below.
  } finally {
    await parser.destroy().catch(() => {});
  }

  return extractTextViaConfiguredOcr(file.buffer, "application/pdf", "input.pdf", env, {
    totalPages,
  });
}

async function extractSourceTextFromDocx(file, env) {
  try {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    const text = normalizeSourceMaterialText(result.value);
    if (isExtractedTextMeaningful(text)) {
      return text;
    }
  } catch (_) {}

  return extractTextViaUpstage(
    file.buffer,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    file.originalname || "input.docx",
    env?.UPSTAGE_API_KEY
  );
}

async function extractSourceTextFromHwp(file, env) {
  return extractTextViaUpstage(
    file.buffer,
    "application/x-hwp",
    file.originalname || "input.hwp",
    env?.UPSTAGE_API_KEY
  );
}

function extractSourceTextFromBuffer(file) {
  const decoder = new TextDecoder("utf-8");
  return normalizeSourceMaterialText(decoder.decode(file.buffer));
}

async function extractSourceTextFromHwpx(file, env) {
  try {
    const text = await officeparser.parseOffice(file.buffer);
    const normalized = normalizeSourceMaterialText(text);
    if (isExtractedTextMeaningful(normalized)) {
      return normalized;
    }
  } catch (_) {}

  return extractTextViaUpstage(
    file.buffer,
    "application/hwp+zip",
    file.originalname || "input.hwpx",
    env?.UPSTAGE_API_KEY
  );
}

async function extractSourceTextFromPptx(file, env) {
  try {
    const text = await officeparser.parseOffice(file.buffer);
    const normalized = normalizeSourceMaterialText(text);
    if (isExtractedTextMeaningful(normalized)) {
      return normalized;
    }
  } catch (_) {}

  return extractTextViaUpstage(
    file.buffer,
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    file.originalname || "input.pptx",
    env?.UPSTAGE_API_KEY
  );
}

function extractSourceTextFromXlsx(file) {
  const workbook = XLSX.read(file.buffer, { type: "buffer" });
  const texts = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    texts.push(`[${sheetName}]`);
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    if (csv.trim()) {
      texts.push(csv.trim());
    }
  }

  return normalizeSourceMaterialText(texts.join("\n\n"));
}

async function extractSourceTextFromImage(file, env) {
  const ext = getUploadFileExtension(file) || "png";
  const mimeType = file.mimetype || `image/${ext}`;
  return extractTextViaConfiguredOcr(
    file.buffer,
    mimeType,
    file.originalname || `input.${ext}`,
    env
  );
}

export async function extractSourceTextFromUpload(file, env) {
  if (isPdfUpload(file)) return extractSourceTextFromPdf(file, env);
  if (isDocxUpload(file)) return extractSourceTextFromDocx(file, env);
  if (isHwpUpload(file)) return extractSourceTextFromHwp(file, env);
  if (isHwpxUpload(file)) return extractSourceTextFromHwpx(file, env);
  if (isPptxUpload(file)) return extractSourceTextFromPptx(file, env);
  if (isXlsxUpload(file)) return extractSourceTextFromXlsx(file);
  if (isImageUpload(file)) return extractSourceTextFromImage(file, env);
  if (isTextBasedUpload(file)) return extractSourceTextFromBuffer(file);
  throw new Error("Unsupported file format.");
}
