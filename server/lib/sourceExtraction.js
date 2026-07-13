const { execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const mammoth = require("mammoth");
const HWPDocument = require("hwp.js").default;
const XLSX = require("xlsx");
const officeparser = require("officeparser");

const { countMatches, normalizeSourceMaterialText } = require("./text");
const {
  buildGoogleDocumentAiPageChunks,
  extractTextWithGoogleDocumentAi,
  GOOGLE_DOCUMENT_AI_MAX_ONLINE_PDF_PAGES,
  resolveGoogleDocumentAiConfig,
  supportsGoogleDocumentAiMimeType,
} = require("../../shared/backend-core/dist/cjs/googleDocumentAi");

function getUploadFileExtension(file) {
  return String(file.originalname || "").toLowerCase().split(".").pop() || "";
}

function isPdfUpload(file) {
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

function isImageUpload(file) {
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

function isSupportedUpload(file) {
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

function runCommand(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${cmd} failed: ${stderr || error.message}`));
        return;
      }

      resolve(stdout);
    });
  });
}

async function extractTextFromPdfViaOcr(buffer, options = {}) {
  const googleConfig = resolveGoogleDocumentAiConfig({
    projectId: process.env.GOOGLE_DOCUMENT_AI_PROJECT_ID,
    location: process.env.GOOGLE_DOCUMENT_AI_LOCATION,
    processorId: process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID,
    clientEmail: process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL,
    privateKey: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
    privateKeyId: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_ID,
    serviceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
  });
  const ocrProvider = String(options.provider || process.env.OCR_PROVIDER || "auto").toLowerCase();
  const canUseGoogleDocumentAi =
    (ocrProvider === "auto" || ocrProvider === "google_document_ai") &&
    googleConfig &&
    supportsGoogleDocumentAiMimeType("application/pdf");

  if (canUseGoogleDocumentAi) {
    try {
      console.log("OCR: using Google Cloud Document AI OCR...");
      const totalPages = Number(options.totalPages);
      let text = "";

      if (Number.isFinite(totalPages) && totalPages > GOOGLE_DOCUMENT_AI_MAX_ONLINE_PDF_PAGES) {
        const pageChunks = buildGoogleDocumentAiPageChunks(
          totalPages,
          GOOGLE_DOCUMENT_AI_MAX_ONLINE_PDF_PAGES
        );
        const parts = [];

        for (const pages of pageChunks) {
          console.log(`OCR: Google Document AI processing PDF pages ${pages[0]}-${pages[pages.length - 1]}...`);
          const chunkText = await extractTextWithGoogleDocumentAi({
            buffer,
            config: googleConfig,
            fileName: "input.pdf",
            mimeType: "application/pdf",
            pageNumbers: pages,
          });
          parts.push(chunkText);
        }

        text = parts.join("\n\n");
      } else {
        text = await extractTextWithGoogleDocumentAi({
          buffer,
          config: googleConfig,
          fileName: "input.pdf",
          mimeType: "application/pdf",
        });
      }

      console.log(`OCR: extracted ${text.length} chars via Google Cloud Document AI`);
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

  const apiKey = process.env.UPSTAGE_API_KEY;
  if (!apiKey) {
    if (ocrProvider === "google_document_ai") {
      throw new Error(
        "Google Document AI is selected, but GOOGLE_DOCUMENT_AI_* credentials are incomplete."
      );
    }

    throw new Error(
      "This PDF does not contain enough embedded text, so OCR is required. Set UPSTAGE_API_KEY or Google Document AI credentials to process scanned/image-based PDFs."
    );
  }

  console.log("OCR: using Upstage Document Parse API...");

  const formData = new FormData();
  formData.append("document", new Blob([buffer], { type: "application/pdf" }), "input.pdf");
  formData.append("ocr", "force");

  const response = await fetch("https://api.upstage.ai/v1/document-ai/document-parse", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Upstage OCR failed: ${error?.error?.message || response.statusText}`);
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

  console.log(`OCR: extracted ${text.length} chars via Upstage`);
  return normalizeSourceMaterialText(text);
}

function isExtractedTextMeaningful(text) {
  const stripped = text
    .replace(/--\s*\d+\s*of\s*\d+\s*--/g, "")
    .replace(/\s+/g, "")
    .trim();

  return stripped.length >= 30;
}

function getMeaningfulTextLength(text) {
  return String(text || "")
    .replace(/--\s*\d+\s*of\s*\d+\s*--/g, "")
    .replace(/\s+/g, "")
    .trim().length;
}

function assessPdfTextCoverage({ text, totalPages, pages }) {
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

function assessExtractedTextQuality(text) {
  if (!text || text.trim().length === 0) {
    return { ok: false, reason: "empty" };
  }

  const chars = [...text.replace(/\s+/g, "")];
  if (chars.length === 0) {
    return { ok: false, reason: "empty" };
  }

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

async function extractSourceTextFromPdf(file, options = {}) {
  const { PDFParse } = require("pdf-parse");
  const parser = new PDFParse({ data: file.buffer });
  const extractionMode = String(options.extractionMode || "auto").toLowerCase();
  let totalPages;
  let parsedText = "";
  let parsedCoverage = null;
  let fallbackReason = "";

  if (extractionMode === "upstage-ocr") {
    return extractTextFromPdfViaOcr(file.buffer, { provider: "upstage" });
  }

  try {
    const result = await parser.getText();
    totalPages = result.total;
    const text = normalizeSourceMaterialText(result.text);
    parsedText = text;
    const coverage = assessPdfTextCoverage({
      text,
      totalPages: result.total,
      pages: result.pages,
    });
    parsedCoverage = coverage;

    if (extractionMode === "pdf-parser") {
      console.log(
        `PDF: extracted ${text.length} chars via pdf-parse only (${coverage.meaningfulPages}/${coverage.totalPages} meaningful pages)`
      );
      return text;
    }

    if (isExtractedTextMeaningful(text) && !coverage.suspicious) {
      console.log(
        `PDF: extracted ${text.length} chars via pdf-parse (${coverage.meaningfulPages}/${coverage.totalPages} meaningful pages)`
      );
      return text;
    }

    fallbackReason = coverage.suspicious
      ? coverage.reasons.join("; ")
      : "PDF text extraction yielded little content";

    console.log(
      `${fallbackReason}; pdf-parse extracted ${text.length} chars, falling back to OCR...`
    );
  } catch (error) {
    fallbackReason = `PDF text extraction failed (${error.message})`;
    if (extractionMode === "pdf-parser") {
      throw error;
    }
    console.log(`PDF text extraction failed (${error.message}), falling back to OCR...`);
  } finally {
    await parser.destroy().catch(() => {});
  }

  try {
    return await extractTextFromPdfViaOcr(file.buffer, { totalPages });
  } catch (ocrError) {
    const quality = assessExtractedTextQuality(parsedText);
    if (parsedText && isExtractedTextMeaningful(parsedText) && quality.ok) {
      console.warn(
        `OCR unavailable (${ocrError.message}). Using partial pdf-parse text (${parsedText.length} chars). Reason: ${fallbackReason}`
      );
      return parsedText;
    }

    if (parsedCoverage) {
      console.warn(
        `PDF parse fallback unusable: ${parsedText.length} chars; coverage=${JSON.stringify(parsedCoverage)}`
      );
    }
    throw ocrError;
  }
}

async function extractSourceTextFromDocx(file) {
  const result = await mammoth.extractRawText({ buffer: file.buffer });
  return normalizeSourceMaterialText(result.value);
}

async function extractSourceTextFromHwp(file) {
  const document = new HWPDocument(file.buffer);
  const texts = [];

  for (const section of document.sections) {
    for (const paragraph of section.paragraphs) {
      const line = paragraph.texts.map((text) => text.text).join("");
      if (line.trim()) {
        texts.push(line);
      }
    }
  }

  return normalizeSourceMaterialText(texts.join("\n"));
}

function extractSourceTextFromBuffer(file) {
  return normalizeSourceMaterialText(file.buffer.toString("utf-8"));
}

async function extractSourceTextFromHwpx(file) {
  const text = await officeparser.parseOffice(file.buffer);
  return normalizeSourceMaterialText(text);
}

async function extractSourceTextFromPptx(file) {
  const text = await officeparser.parseOffice(file.buffer);
  return normalizeSourceMaterialText(text);
}

function extractSourceTextFromXlsx(file) {
  const workbook = XLSX.read(file.buffer, { type: "buffer" });
  const texts = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      continue;
    }

    texts.push(`[${sheetName}]`);
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    if (csv.trim()) {
      texts.push(csv.trim());
    }
  }

  return normalizeSourceMaterialText(texts.join("\n\n"));
}

async function extractSourceTextFromImage(file) {
  const ocrProvider = String(process.env.OCR_PROVIDER || "auto").toLowerCase();
  const googleConfig = resolveGoogleDocumentAiConfig({
    projectId: process.env.GOOGLE_DOCUMENT_AI_PROJECT_ID,
    location: process.env.GOOGLE_DOCUMENT_AI_LOCATION,
    processorId: process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID,
    clientEmail: process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL,
    privateKey: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
    privateKeyId: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_ID,
    serviceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
  });
  const mimeType = file.mimetype || `image/${getUploadFileExtension(file) || "png"}`;

  if (
    (ocrProvider === "auto" || ocrProvider === "google_document_ai") &&
    googleConfig &&
    supportsGoogleDocumentAiMimeType(mimeType)
  ) {
    try {
      console.log("OCR: using Google Cloud Document AI OCR for image...");
      const text = await extractTextWithGoogleDocumentAi({
        buffer: file.buffer,
        config: googleConfig,
        fileName: file.originalname || "input-image",
        mimeType,
      });
      return normalizeSourceMaterialText(text);
    } catch (error) {
      if (ocrProvider === "google_document_ai") {
        throw error;
      }

      console.warn(
        `OCR: Google Cloud Document AI failed for image, falling back to Tesseract. ${error.message}`
      );
    }
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "clipnote-img-"));
  const extension = getUploadFileExtension(file) || "png";
  const imagePath = path.join(tempDir, `input.${extension}`);

  try {
    fs.writeFileSync(imagePath, file.buffer);
    console.log("OCR: processing image...");
    const text = await runCommand("tesseract", [imagePath, "stdout", "-l", "kor+eng"]);
    return normalizeSourceMaterialText(text);
  } finally {
    try {
      const files = fs.readdirSync(tempDir);
      for (const fileName of files) {
        fs.unlinkSync(path.join(tempDir, fileName));
      }
      fs.rmdirSync(tempDir);
    } catch (_) {}
  }
}

async function extractSourceTextFromUpload(file, options = {}) {
  if (isPdfUpload(file)) return extractSourceTextFromPdf(file, options);
  if (isDocxUpload(file)) return extractSourceTextFromDocx(file);
  if (isHwpUpload(file)) return extractSourceTextFromHwp(file);
  if (isHwpxUpload(file)) return extractSourceTextFromHwpx(file);
  if (isPptxUpload(file)) return extractSourceTextFromPptx(file);
  if (isXlsxUpload(file)) return extractSourceTextFromXlsx(file);
  if (isImageUpload(file)) return extractSourceTextFromImage(file);
  if (isTextBasedUpload(file)) return extractSourceTextFromBuffer(file);
  throw new Error("Unsupported file format.");
}

module.exports = {
  assessPdfTextCoverage,
  assessExtractedTextQuality,
  extractSourceTextFromUpload,
  getUploadFileExtension,
  isDocxUpload,
  isExtractedTextMeaningful,
  isHwpUpload,
  isHwpxUpload,
  isImageUpload,
  isPdfUpload,
  isPptxUpload,
  isSupportedUpload,
  isTextBasedUpload,
  isXlsxUpload,
};
