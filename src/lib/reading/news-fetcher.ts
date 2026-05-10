/**
 * News-page fetcher + main-text extractor.
 *
 * Frozen contract (W1-T1): pure fetch + regex/string-based HTML processing.
 * No cheerio, no @mozilla/readability, no jsdom — kept dependency-free so
 * this layer runs in any Node 20+ runtime (Next.js server, Edge, scripts).
 *
 * Pipeline: fetch URL → strip noise → pick best content container
 * (article > main > div.content > body) → tag-strip → entity-decode →
 * whitespace-normalize → length-validate → return ready-for-LLM text.
 *
 * NO LLM call here. NO logging of fetched content (privacy).
 */

export interface FetchedNewsArticle {
  /** Canonical URL after redirects (response.url). */
  url: string;
  /** Best-effort extracted title. */
  title: string;
  /** Extracted main body text, paragraphs separated by `\n\n`. */
  text: string;
  charCount: number;
  /** ISO timestamp at the moment extraction completed. */
  fetchedAt: string;
  /** Lowercase content-type, no parameters (e.g. "text/html"). */
  contentType: string;
  /** Which extraction path produced the body. */
  extractionStrategy: "article" | "main" | "div-content" | "body";
}

export type NewsFetchErrorCode =
  | "http_error"
  | "invalid_content_type"
  | "too_short"
  | "too_long"
  | "network_timeout"
  | "invalid_url";

export class NewsFetchError extends Error {
  code: NewsFetchErrorCode;
  details?: string;
  constructor(code: NewsFetchErrorCode, message: string, details?: string) {
    super(message);
    this.name = "NewsFetchError";
    this.code = code;
    this.details = details;
  }
}

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_USER_AGENT = "homework-tracker-news/1.0";
const MIN_TEXT_CHARS = 200;
const MAX_TEXT_CHARS = 50_000;

/**
 * Strip an opening tag plus its matching closing tag (and everything between),
 * case-insensitively. Used for `<script>`, `<style>`, `<noscript>`, `<svg>`.
 *
 * The regex uses a non-greedy `[\s\S]*?` so multiple occurrences in one
 * document do not collapse into a single removal.
 */
function stripBlock(html: string, tag: string): string {
  const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi");
  return html.replace(re, "");
}

function stripComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, "");
}

/**
 * Decode the six minimum HTML entities required by the contract:
 * &amp; &lt; &gt; &quot; &#39; &nbsp;
 *
 * Order matters: `&amp;` is decoded LAST so we don't accidentally turn
 * `&amp;lt;` into `<`. We do this by first replacing the others (which
 * don't contain `&amp;`), then `&amp;` → `&`.
 */
function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&");
}

/**
 * Convert a chunk of HTML into plain text.
 *
 * Steps:
 *   1. Strip script/style/noscript/svg blocks
 *   2. Strip HTML comments
 *   3. Convert <br> / <br/> to single newline
 *   4. Convert closing block-level tags (</p>, </div>, </li>, </h1..6>)
 *      to double newlines so paragraphs survive
 *   5. Strip every remaining tag
 *   6. Decode the six minimum entities
 *   7. Per-line trim + collapse 3+ newlines to 2
 */
function htmlToText(html: string): string {
  let s = html;
  s = stripBlock(s, "script");
  s = stripBlock(s, "style");
  s = stripBlock(s, "noscript");
  s = stripBlock(s, "svg");
  s = stripComments(s);

  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/(p|div|li|h[1-6])\s*>/gi, "\n\n");

  s = s.replace(/<[^>]+>/g, "");

  s = decodeEntities(s);

  // Trim trailing whitespace per line.
  s = s
    .split("\n")
    .map((line) => line.replace(/[ \t\r\f\v]+$/g, ""))
    .join("\n");

  // Collapse 3+ consecutive newlines to exactly 2.
  s = s.replace(/\n{3,}/g, "\n\n");

  return s.trim();
}

/**
 * Find the inner HTML of the first `<tag>...</tag>` occurrence,
 * case-insensitive, attribute-tolerant.
 *
 * Returns null if not found. Uses a non-greedy match; for nested same-tag
 * elements (e.g. `<div>` inside `<div>`) this picks the OUTERMOST opening
 * tag's content via lazy matching to the first closing tag — which is
 * intentionally lossy. For `<article>` / `<main>` nesting is rare in
 * news pages so this is acceptable per the frozen design.
 */
function findFirstBlock(html: string, tag: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = html.match(re);
  return m ? m[1] : null;
}

/**
 * Find the first <div> whose class attribute contains one of: article, post,
 * content. Returns the inner HTML or null. We scan all `<div ...>` openings
 * and check class string; on match we slice from after that opening tag to
 * the matching `</div>` using a depth counter so nested divs are handled.
 */
function findContentDiv(html: string): string | null {
  const openRe = /<div\b([^>]*)>/gi;
  let openMatch: RegExpExecArray | null;
  while ((openMatch = openRe.exec(html)) !== null) {
    const attrs = openMatch[1];
    const classMatch = attrs.match(/\bclass\s*=\s*("([^"]*)"|'([^']*)')/i);
    if (!classMatch) continue;
    const classValue = (classMatch[2] ?? classMatch[3] ?? "").toLowerCase();
    const classTokens = classValue.split(/\s+/).filter(Boolean);
    const hits = classTokens.some(
      (t) => t === "article" || t === "post" || t === "content"
    );
    if (!hits) continue;

    // Walk forward counting <div> / </div> to find the matching close.
    const start = openRe.lastIndex;
    const tail = html.slice(start);
    const tagRe = /<(\/?)div\b[^>]*>/gi;
    let depth = 1;
    let m: RegExpExecArray | null;
    while ((m = tagRe.exec(tail)) !== null) {
      if (m[1] === "/") {
        depth -= 1;
        if (depth === 0) {
          return tail.slice(0, m.index);
        }
      } else {
        depth += 1;
      }
    }
    // Unbalanced; treat the rest of the document as the body.
    return tail;
  }
  return null;
}

/**
 * Title priority:
 *   1. <meta property="og:title" content="...">
 *   2. <title>...</title>
 *   3. First <h1> after tag-stripping
 *
 * Falls back to the URL pathname's last segment when nothing matches.
 */
function extractTitle(html: string, url: string): string {
  // og:title — handle either attribute order: property/name first or content
  // first. Be tolerant of single/double quotes.
  const ogPatterns = [
    /<meta\b[^>]*?\bproperty\s*=\s*["']og:title["'][^>]*?\bcontent\s*=\s*("([^"]*)"|'([^']*)')[^>]*>/i,
    /<meta\b[^>]*?\bcontent\s*=\s*("([^"]*)"|'([^']*)')[^>]*?\bproperty\s*=\s*["']og:title["'][^>]*>/i,
    /<meta\b[^>]*?\bname\s*=\s*["']og:title["'][^>]*?\bcontent\s*=\s*("([^"]*)"|'([^']*)')[^>]*>/i,
  ];
  for (const re of ogPatterns) {
    const m = html.match(re);
    if (m) {
      const raw = m[2] ?? m[3] ?? "";
      const decoded = decodeEntities(raw).trim();
      if (decoded.length > 0) return decoded;
    }
  }

  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    const decoded = decodeEntities(
      titleMatch[1].replace(/<[^>]+>/g, "")
    ).trim();
    if (decoded.length > 0) return decoded;
  }

  const h1Match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    const decoded = decodeEntities(
      h1Match[1].replace(/<[^>]+>/g, "")
    ).trim();
    if (decoded.length > 0) return decoded;
  }

  // Fallback: URL pathname's last non-empty segment.
  try {
    const u = new URL(url);
    const segments = u.pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1] ?? u.hostname;
    return decodeURIComponent(last);
  } catch {
    return url;
  }
}

interface ExtractedBody {
  text: string;
  strategy: FetchedNewsArticle["extractionStrategy"];
}

function extractBody(html: string): ExtractedBody {
  const articleHtml = findFirstBlock(html, "article");
  if (articleHtml !== null) {
    return { text: htmlToText(articleHtml), strategy: "article" };
  }

  const mainHtml = findFirstBlock(html, "main");
  if (mainHtml !== null) {
    return { text: htmlToText(mainHtml), strategy: "main" };
  }

  const divHtml = findContentDiv(html);
  if (divHtml !== null) {
    return { text: htmlToText(divHtml), strategy: "div-content" };
  }

  const bodyHtml = findFirstBlock(html, "body");
  if (bodyHtml !== null) {
    return { text: htmlToText(bodyHtml), strategy: "body" };
  }

  // No <body> tag — operate on the whole document as a last resort,
  // still tagged as "body" for reporting.
  return { text: htmlToText(html), strategy: "body" };
}

function normalizeContentType(raw: string | null): string {
  if (!raw) return "";
  const semi = raw.indexOf(";");
  const head = semi >= 0 ? raw.slice(0, semi) : raw;
  return head.trim().toLowerCase();
}

function isAcceptableContentType(ct: string): boolean {
  return ct === "text/html" || ct === "application/xhtml+xml";
}

/**
 * Fetch a URL and extract its main article text.
 *
 * Throws NewsFetchError with a typed `code` field. Callers map codes to
 * user-facing messages or retry/fallback policy.
 *
 * NOTE: This function does NOT call any LLM. It is pure HTML extraction.
 *       The rewriting step happens in the caller via generateReadingContent.
 */
export async function fetchAndExtract(
  url: string,
  options?: { timeoutMs?: number; userAgent?: string }
): Promise<FetchedNewsArticle> {
  // Step 1: validate URL format up-front so we never spend a network call
  // on a malformed string.
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new NewsFetchError(
      "invalid_url",
      "URL could not be parsed",
      url
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new NewsFetchError(
      "invalid_url",
      `Unsupported protocol: ${parsed.protocol}`,
      url
    );
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const userAgent = options?.userAgent ?? DEFAULT_USER_AGENT;

  // Step 2: fetch with timeout. AbortSignal.timeout throws a DOMException
  // with name "TimeoutError" when the deadline trips; we map that to
  // network_timeout. Any other fetch failure becomes http_error.
  let response: Response;
  try {
    response = await fetch(parsed.toString(), {
      method: "GET",
      headers: {
        "User-Agent": userAgent,
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
    });
  } catch (err) {
    const name = (err as { name?: string } | undefined)?.name ?? "";
    const msg = err instanceof Error ? err.message : String(err);
    if (name === "TimeoutError" || /timeout/i.test(msg)) {
      throw new NewsFetchError(
        "network_timeout",
        `Request timed out after ${timeoutMs}ms`,
        msg
      );
    }
    throw new NewsFetchError("http_error", `Network failure: ${msg}`, msg);
  }

  // Step 3: status check.
  if (!response.ok) {
    throw new NewsFetchError(
      "http_error",
      `HTTP ${response.status}`,
      response.statusText
    );
  }

  // Step 4: content-type check.
  const contentType = normalizeContentType(response.headers.get("content-type"));
  if (!isAcceptableContentType(contentType)) {
    throw new NewsFetchError(
      "invalid_content_type",
      `Unsupported content-type: ${contentType || "<missing>"}`,
      contentType
    );
  }

  // Step 5: read body.
  let html: string;
  try {
    html = await response.text();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new NewsFetchError(
      "http_error",
      `Failed to read response body: ${msg}`,
      msg
    );
  }

  // Step 6 + 7: extract body (priority order) and convert to text.
  const { text, strategy } = extractBody(html);

  // Step 8: length validation.
  if (text.length < MIN_TEXT_CHARS) {
    throw new NewsFetchError(
      "too_short",
      `Extracted text is ${text.length} chars (min ${MIN_TEXT_CHARS})`,
      `strategy=${strategy}`
    );
  }
  if (text.length > MAX_TEXT_CHARS) {
    throw new NewsFetchError(
      "too_long",
      `Extracted text is ${text.length} chars (max ${MAX_TEXT_CHARS})`,
      `strategy=${strategy}`
    );
  }

  // Step 9: title extraction.
  const title = extractTitle(html, response.url || parsed.toString());

  // Step 10: assemble result.
  return {
    url: response.url || parsed.toString(),
    title,
    text,
    charCount: text.length,
    fetchedAt: new Date().toISOString(),
    contentType,
    extractionStrategy: strategy,
  };
}
