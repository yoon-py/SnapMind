export function slugify(value: unknown, fallback: string) {
  const slug = String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || fallback;
}

export function trimText(value: unknown, fallback: string) {
  const cleaned = String(value || "").replace(/\s+/g, " ").trim();
  return cleaned || fallback;
}

export function normalizeSourceMaterialText(value: unknown) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function clampText(value: unknown, maxLength: number) {
  const cleaned = String(value || "").trim();

  if (!cleaned || cleaned.length <= maxLength) {
    return cleaned;
  }

  const slice = cleaned.slice(0, maxLength + 1);
  const lastSpace = slice.lastIndexOf(" ");
  const clipped =
    lastSpace > Math.floor(maxLength * 0.6) ? slice.slice(0, lastSpace) : cleaned.slice(0, maxLength);

  return `${clipped.replace(/[.,:;!?-]+$/g, "").trim()}...`;
}

export function clampLabel(value: unknown, maxLength: number) {
  const cleaned = String(value || "").trim();

  if (!cleaned || cleaned.length <= maxLength) {
    return cleaned;
  }

  const slice = cleaned.slice(0, maxLength + 1);
  const lastSpace = slice.lastIndexOf(" ");
  return (
    lastSpace > Math.floor(maxLength * 0.6) ? slice.slice(0, lastSpace) : cleaned.slice(0, maxLength)
  )
    .replace(/[.,:;!?-]+$/g, "")
    .trim();
}

export function normalizeShortTitle(
  value: unknown,
  fallback: string,
  maxLength: number,
  maxWords: number
) {
  let cleaned = trimText(value, fallback)
    .replace(/\s*[\(\[（][^)\]）]{1,40}[\)\]）]\s*/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    cleaned = trimText(fallback, "");
  }

  if (cleaned.includes(" ") && maxWords > 0) {
    cleaned = cleaned.split(" ").slice(0, maxWords).join(" ");
  }

  return clampLabel(cleaned, maxLength) || trimText(fallback, "");
}

export function countMatches(text: unknown, pattern: RegExp) {
  return (String(text || "").match(pattern) || []).length;
}

export function countWords(text: unknown) {
  return (String(text || "").match(/\S+/g) || []).length;
}
