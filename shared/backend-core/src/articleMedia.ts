import { load } from "cheerio";
import { trimText } from "./text";

export type ArticleImageKind = "hero" | "body";

export type ArticleImage = {
  url: string;
  caption: string;
  alt: string;
  kind: ArticleImageKind;
  width?: number;
  height?: number;
};

export type FetchedArticle = {
  sourceUrl: string;
  siteName: string;
  title: string;
  byline: string;
  publishedAt: string;
  bodyText: string;
  images: ArticleImage[];
};

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// URLs that are almost never editorial photos.
const IMAGE_URL_BLOCKLIST =
  /(logo|sprite|icon|favicon|avatar|profile|placeholder|blank|spacer|1x1|pixel|tracking|advert|banner|emoji)/i;

const ARTICLE_CONTAINER_SELECTORS = [
  "article",
  "[itemprop='articleBody']",
  "[class*='article-body']",
  "[class*='article_body']",
  "[class*='articleBody']",
  "[class*='news-content']",
  "[class*='news_content']",
  "[id*='article-body']",
  "[id*='articleBody']",
  "[id*='news-content']",
  "main",
];

function resolveUrl(src: string | undefined, baseUrl: string): string {
  const raw = trimText(src, "");
  if (!raw || raw.startsWith("data:")) {
    return "";
  }
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return "";
  }
}

function isLikelyEditorialImage(url: string, width?: number, height?: number): boolean {
  if (!url) return false;
  if (IMAGE_URL_BLOCKLIST.test(url)) return false;
  if (/\.svg(\?|$)/i.test(url)) return false;
  if (typeof width === "number" && width > 0 && width < 200) return false;
  if (typeof height === "number" && height > 0 && height < 200) return false;
  return true;
}

function toNumberOrUndefined(value: string | undefined): number | undefined {
  const n = Number(trimText(value, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Fetch a news article URL and harvest its body text + editorial images,
 * so they can feed the existing shorts pipeline WITHOUT generating images.
 */
export async function fetchArticle({
  url,
  fetchImpl = fetch,
  userAgent = DEFAULT_USER_AGENT,
}: {
  url: string;
  fetchImpl?: typeof fetch;
  userAgent?: string;
}): Promise<FetchedArticle> {
  const sourceUrl = trimText(url, "");
  if (!sourceUrl) {
    throw new Error("Article URL is required.");
  }

  const response = await fetchImpl(sourceUrl, {
    headers: {
      "user-agent": userAgent,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "ko,en;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch article (${response.status}): ${sourceUrl}`);
  }

  const html = await response.text();
  return parseArticleHtml({ html, sourceUrl });
}

/** Pure HTML → article parser (separated so it is unit-testable without network). */
export function parseArticleHtml({
  html,
  sourceUrl,
}: {
  html: string;
  sourceUrl: string;
}): FetchedArticle {
  const $ = load(html);

  const meta = (name: string): string =>
    trimText(
      $(`meta[property='${name}']`).attr("content") ||
        $(`meta[name='${name}']`).attr("content"),
      ""
    );

  const siteName = meta("og:site_name") || trimText(new URL(sourceUrl).hostname, "");
  const title =
    meta("og:title") || trimText($("title").first().text(), "") || trimText($("h1").first().text(), "");
  const byline =
    meta("article:author") ||
    meta("author") ||
    trimText($("[rel='author']").first().text(), "") ||
    trimText($("[class*='byline']").first().text(), "");
  const publishedAt =
    meta("article:published_time") || meta("og:updated_time") || meta("date");

  // --- Body container ---
  let $container = $();
  for (const selector of ARTICLE_CONTAINER_SELECTORS) {
    const candidate = $(selector).first();
    if (candidate.length && trimText(candidate.text(), "").length > 200) {
      $container = candidate;
      break;
    }
  }
  if (!$container.length) {
    $container = $("body");
  }

  // --- Body text ---
  const paragraphs: string[] = [];
  $container.find("p").each((_, el) => {
    const text = trimText($(el).text(), "");
    if (text.length >= 20) {
      paragraphs.push(text);
    }
  });
  const bodyText =
    paragraphs.join("\n\n") || trimText($container.text(), "").replace(/\s{3,}/g, "\n\n");

  // --- Images ---
  const seen = new Set<string>();
  const images: ArticleImage[] = [];

  const heroUrl = resolveUrl(meta("og:image"), sourceUrl);
  if (heroUrl && isLikelyEditorialImage(heroUrl)) {
    seen.add(heroUrl);
    images.push({ url: heroUrl, caption: title, alt: title, kind: "hero" });
  }

  $container.find("figure, img").each((_, el) => {
    const $el = $(el);
    const $img = $el.is("img") ? $el : $el.find("img").first();
    if (!$img.length) return;

    const rawSrc =
      $img.attr("src") ||
      $img.attr("data-src") ||
      $img.attr("data-original") ||
      ($img.attr("srcset") || "").split(",").pop()?.trim().split(" ")[0];
    const imgUrl = resolveUrl(rawSrc, sourceUrl);
    const width = toNumberOrUndefined($img.attr("width"));
    const height = toNumberOrUndefined($img.attr("height"));

    if (!imgUrl || seen.has(imgUrl) || !isLikelyEditorialImage(imgUrl, width, height)) {
      return;
    }
    seen.add(imgUrl);

    const caption =
      trimText($el.find("figcaption").first().text(), "") ||
      trimText($img.attr("alt"), "");

    images.push({
      url: imgUrl,
      caption,
      alt: trimText($img.attr("alt"), ""),
      kind: "body",
      width,
      height,
    });
  });

  return {
    sourceUrl,
    siteName,
    title,
    byline,
    publishedAt: trimText(publishedAt, ""),
    bodyText,
    images,
  };
}

function keywordOverlapScore(a: string, b: string): number {
  const tokenize = (text: string) =>
    trimText(text, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]+/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2);
  const setB = new Set(tokenize(b));
  if (setB.size === 0) return 0;
  let hits = 0;
  for (const token of new Set(tokenize(a))) {
    if (setB.has(token)) hits += 1;
  }
  return hits;
}

export type SceneMedia = {
  type: "image";
  url: string;
  caption: string;
  credit: string;
  sourceUrl: string;
};

/**
 * Assign harvested article images to shorts scenes.
 * - hero → first scene
 * - body images → best keyword match against scene text, else round-robin
 * - reuse images when there are fewer photos than scenes
 */
export function matchScenesToMedia<T extends Record<string, any>>({
  scenes,
  article,
}: {
  scenes: T[];
  article: FetchedArticle;
}): (T & { media: SceneMedia })[] {
  const credit = article.siteName || trimText(new URL(article.sourceUrl).hostname, "");
  const hero = article.images.find((img) => img.kind === "hero");
  const body = article.images.filter((img) => img.kind !== "hero");
  const pool = body.length > 0 ? body : article.images;

  const toMedia = (img: ArticleImage | undefined): SceneMedia | null =>
    img
      ? {
          type: "image",
          url: img.url,
          caption: img.caption,
          credit,
          sourceUrl: article.sourceUrl,
        }
      : null;

  return scenes.map((scene, index) => {
    const sceneText = `${trimText(scene.headline, "")} ${trimText(scene.body, "")} ${trimText(
      scene.narration,
      ""
    )}`;

    let chosen: ArticleImage | undefined;
    if (index === 0 && hero) {
      chosen = hero;
    } else if (pool.length > 0) {
      let best = pool[0];
      let bestScore = -1;
      pool.forEach((img, imgIndex) => {
        const score =
          keywordOverlapScore(sceneText, `${img.caption} ${img.alt}`) +
          // light round-robin bias so identical-score images still spread out
          (imgIndex === index % pool.length ? 0.5 : 0);
        if (score > bestScore) {
          bestScore = score;
          best = img;
        }
      });
      chosen = best;
    } else if (hero) {
      chosen = hero;
    }

    const media = toMedia(chosen);
    return {
      ...scene,
      media:
        media || {
          type: "image",
          url: "",
          caption: "",
          credit,
          sourceUrl: article.sourceUrl,
        },
    };
  });
}
