#!/usr/bin/env tsx

/**
 * CommonLit Scraper Script
 *
 * Scrapes reading content from commonlit.org and upserts to reading_topics table.
 *
 * Environment variables:
 *   NEXT_PUBLIC_SUPABASE_URL  (required)
 *   SUPABASE_SERVICE_ROLE_KEY (required)
 *
 * Usage:
 *   npx tsx scripts/reading/scrapers/commonlit-scraper.ts
 *   npx tsx scripts/reading/scrapers/commonlit-scraper.ts --dry-run
 *   npx tsx scripts/reading/scrapers/commonlit-scraper.ts --limit 10
 *
 * CLI Arguments:
 *   --dry-run    Show what would be scraped without writing to database
 *   --limit N    Maximum number of texts to process (default: 30)
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { extractImages } from "../../../src/lib/reading/source-image-extractor";
import { Pacer } from "../../../src/lib/reading/concurrency";

config({ path: ".env.local" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CommonLitText {
  id: string;
  title: string;
  author: string | null;
  url: string;
  gradesMin: number;
  gradesMax: number;
  themes: string[];
  isPublic: boolean;
  excerpt?: string;
  fullText?: string;
  strategy?: ExtractionStrategy;
}

interface TopicUpsertData {
  topic_key: string;
  title: string;
  author: string | null;
  language: string;
  category: string;
  source: string;
  source_url: string;
  source_text: string | null;
  source_image_url: string | null;
  source_inline_image_urls: string[] | null;
  grade_level: number;
  target_grades: number[];
  status: string;
  content_completeness: string;
  metadata: Record<string, unknown>;
}

type ExtractionStrategy =
  | "article"
  | "div-passage"
  | "div-text-content"
  | "section-story"
  | "json-ld"
  | "preloaded-state"
  | "og-description"
  | "none";

interface ExtractedContent {
  fullText?: string;
  excerpt?: string;
  strategy: ExtractionStrategy;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const COMMONLIT_BASE_URL = "https://www.commonlit.org";
const COMMONLIT_LIBRARY_URL = "https://www.commonlit.org/our-library";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const DETAIL_CONCURRENCY = 3;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateEnv(): void {
  const required = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(", ")}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// CLI Arguments
// ---------------------------------------------------------------------------

function parseArgs(): { dryRun: boolean; limit: number } {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : 30;

  return { dryRun, limit: isNaN(limit) || limit < 1 ? 30 : limit };
}

// ---------------------------------------------------------------------------
// HTTP Utilities
// ---------------------------------------------------------------------------

async function fetchHtml(url: string, options: RequestInit = {}): Promise<string> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText} for ${url}`);
  }

  return response.text();
}

// ---------------------------------------------------------------------------
// HTML Parsing Utilities
// ---------------------------------------------------------------------------

/**
 * Extract text content from an HTML string between two delimiters
 */
function extractBetween(html: string, start: string, end: string): string | null {
  const startIdx = html.indexOf(start);
  if (startIdx === -1) return null;
  const contentStart = startIdx + start.length;
  const endIdx = html.indexOf(end, contentStart);
  if (endIdx === -1) return null;
  return html.slice(contentStart, endIdx).trim();
}

/**
 * Create a slug from title for topic_key
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 100);
}

/**
 * Strip script/style/noscript/svg blocks and comments, convert block tags
 * to paragraph breaks, strip remaining tags, decode entities.
 */
function htmlToText(html: string): string {
  let s = html;

  // Strip blocks
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  s = s.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, "");
  s = s.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, "");
  s = s.replace(/<!--[\s\S]*?-->/g, "");

  // Convert breaks and closing block tags to newlines
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/(p|div|li|h[1-6])\s*>/gi, "\n\n");

  // Strip remaining tags
  s = s.replace(/<[^>]+>/g, "");

  // Decode entities
  s = s
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&");

  // Trim trailing whitespace per line, collapse 3+ newlines to 2
  s = s
    .split("\n")
    .map((line) => line.replace(/[ \t\r\f\v]+$/g, ""))
    .join("\n");
  s = s.replace(/\n{3,}/g, "\n\n");

  return s.trim();
}

/**
 * Find the inner HTML of the first occurrence of a tag, case-insensitive.
 */
function findFirstBlock(html: string, tag: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = html.match(re);
  return m ? m[1] : null;
}

/**
 * Find the first <div> whose class or id attribute matches one of the
 * given tokens. Uses depth counting for nested divs.
 */
function findDivByClassOrId(
  html: string,
  tokens: string[],
  attr: "class" | "id" = "class"
): string | null {
  const openRe = /<div\b([^>]*)>/gi;
  let openMatch: RegExpExecArray | null;

  while ((openMatch = openRe.exec(html)) !== null) {
    const attrs = openMatch[1];
    const attrMatch = attrs.match(
      new RegExp(`\\b${attr}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i")
    );
    if (!attrMatch) continue;

    const attrValue = (attrMatch[2] ?? attrMatch[3] ?? "").toLowerCase();
    const attrTokens = attrValue.split(/\s+/).filter(Boolean);
    const hits = attrTokens.some((t) => tokens.includes(t));
    if (!hits) continue;

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
    return tail;
  }
  return null;
}

/**
 * Find the first <section> whose class attribute matches one of the tokens.
 */
function findSectionByClass(html: string, tokens: string[]): string | null {
  const openRe = /<section\b([^>]*)>/gi;
  let openMatch: RegExpExecArray | null;

  while ((openMatch = openRe.exec(html)) !== null) {
    const attrs = openMatch[1];
    const classMatch = attrs.match(/\bclass\s*=\s*("([^"]*)"|'([^']*)')/i);
    if (!classMatch) continue;

    const classValue = (classMatch[2] ?? classMatch[3] ?? "").toLowerCase();
    const classTokens = classValue.split(/\s+/).filter(Boolean);
    const hits = classTokens.some((t) => tokens.includes(t));
    if (!hits) continue;

    const start = openRe.lastIndex;
    const tail = html.slice(start);
    const tagRe = /<(\/?)section\b[^>]*>/gi;
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
    return tail;
  }
  return null;
}

/**
 * Extract og:description meta tag content.
 */
function extractOgDescription(html: string): string | null {
  const patterns = [
    /<meta\b[^>]*?\bproperty\s*=\s*["']og:description["'][^>]*?\bcontent\s*=\s*("([^"]*)"|'([^']*)')[^>]*>/i,
    /<meta\b[^>]*?\bcontent\s*=\s*("([^"]*)"|'([^']*)')[^>]*?\bproperty\s*=\s*["']og:description["'][^>]*>/i,
    /<meta\b[^>]*?\bname\s*=\s*["']og:description["'][^>]*?\bcontent\s*=\s*("([^"]*)"|'([^']*)')[^>]*>/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) {
      const raw = m[2] ?? m[3] ?? "";
      const decoded = raw
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .trim();
      if (decoded.length > 0) return decoded;
    }
  }
  return null;
}

/**
 * Extract JSON-LD articleBody if present.
 */
function extractJsonLdArticleBody(html: string): string | null {
  const ldRe = /<script\b[^>]*?\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = ldRe.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1].trim());
      const candidates = Array.isArray(data) ? data : [data];
      for (const item of candidates) {
 if (item && typeof item.articleBody === "string" && item.articleBody.length > 100) {
          return item.articleBody;
        }
      }
    } catch {
      // Continue to next script tag
    }
  }
  return null;
}

/**
 * Decode common HTML entities
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

// ---------------------------------------------------------------------------
// CommonLit API / Page Scraping
// ---------------------------------------------------------------------------

/**
 * Fetch the CommonLit library page and parse the catalog of texts.
 * Only falls back to sample data when all API and scraping attempts fail.
 */
async function fetchLibraryCatalog(): Promise<CommonLitText[]> {
  console.log("Fetching CommonLit library catalog...");

  // CommonLit uses an API endpoint for fetching texts
  const apiUrl =
    "https://www.commonlit.org/api/v1/library/texts/?format=json&is_public=true";

  try {
    const html = await fetchHtml(apiUrl);
    if (isLoginRequired(html)) {
      console.log("  API requires authentication, trying page scraping...");
      return fetchLibraryFromPage();
    }
    return parseLibraryApiResponse(html);
  } catch {
    console.log("  API endpoint not available, trying page scraping...");
    return fetchLibraryFromPage();
  }
}

/**
 * Parse the API response to extract text metadata
 */
function parseLibraryApiResponse(content: string): CommonLitText[] {
  const texts: CommonLitText[] = [];

  try {
    // Try to parse as JSON
    const data = JSON.parse(content);
    const items = Array.isArray(data) ? data : data.results || data.texts || [];

    for (const item of items) {
      texts.push({
        id: item.id || item._id || "",
        title: item.title || "Untitled",
        author: item.author || null,
        url: item.url || item.story_url || `${COMMONLIT_BASE_URL}/texts/${item.id}`,
        gradesMin: item.grades_min || item.grade_range?.[0] || 6,
        gradesMax: item.grades_max || item.grade_range?.[1] || 12,
        themes: item.themes || item.categories || item.tags || [],
        isPublic: item.is_public ?? item.public ?? true,
        excerpt: item.excerpt || item.description || undefined,
      });
    }
  } catch {
    // Not JSON, try HTML parsing
    return parseLibraryHtml(content);
  }

  return texts;
}

/**
 * Fetch and parse the library page directly (fallback before sample data)
 */
async function fetchLibraryFromPage(): Promise<CommonLitText[]> {
  console.log("Fetching library page...");
  try {
    const html = await fetchHtml(COMMONLIT_LIBRARY_URL);
    if (isLoginRequired(html)) {
      console.log("  Library page requires authentication");
      return getSampleTexts();
    }
    const parsed = parseLibraryHtml(html);
    if (parsed.length > 0) return parsed;
    console.log("  No texts found on library page, using sample data");
    return getSampleTexts();
  } catch (err) {
    console.log(`  Library page not accessible: ${(err as Error).message}`);
    return getSampleTexts();
  }
}

/**
 * Check if response indicates login is required
 */
function isLoginRequired(html: string): boolean {
  return (
    html.includes('action="/user/login"') ||
    (html.includes('"Login"') && html.includes("password"))
  );
}

/**
 * Return sample CommonLit texts when API is completely unavailable.
 * Absolute last resort.
 */
function getSampleTexts(): CommonLitText[] {
  console.log("  Using sample data as last resort (API completely unavailable)");
  return [
    {
      id: "sample-001",
      title: "The Gift of the Magi",
      author: "O. Henry",
      url: "https://www.commonlit.org/texts/the-gift-of-the-magi",
      gradesMin: 6,
      gradesMax: 8,
      themes: ["Fiction", "Holiday", "Love"],
      isPublic: true,
      excerpt:
        "A young couple sacrifices their most treasured possessions to buy gifts for each other.",
    },
    {
      id: "sample-002",
      title: "The Tell-Tale Heart",
      author: "Edgar Allan Poe",
      url: "https://www.commonlit.org/texts/the-tell-tale-heart",
      gradesMin: 9,
      gradesMax: 12,
      themes: ["Fiction", "Horror", "Psychological"],
      isPublic: true,
      excerpt:
        "A narrator insists on their sanity while describing a murder they committed.",
    },
    {
      id: "sample-003",
      title: "The Red Wheelbarrow",
      author: "William Carlos Williams",
      url: "https://www.commonlit.org/texts/the-red-wheelbarrow",
      gradesMin: 6,
      gradesMax: 8,
      themes: ["Poetry", "Imagist"],
      isPublic: true,
      excerpt: "A brief imagist poem about a scene outside a window.",
    },
    {
      id: "sample-004",
      title: "Letter from Birmingham Jail",
      author: "Martin Luther King Jr.",
      url: "https://www.commonlit.org/texts/letter-from-birmingham-jail",
      gradesMin: 9,
      gradesMax: 12,
      themes: ["Nonfiction", "Civil Rights", "Persuasive"],
      isPublic: true,
      excerpt:
        "A passionate defense of nonviolent protest against racial injustice.",
    },
    {
      id: "sample-005",
      title: "The Joy of Reading and Writing: Superman and Me",
      author: "Sherman Alexie",
      url: "https://www.commonlit.org/texts/superboy-and-me",
      gradesMin: 9,
      gradesMax: 12,
      themes: ["Nonfiction", "Memoir", "Education"],
      isPublic: true,
      excerpt:
        "A Native American author reflects on learning to read and the power of books.",
    },
  ];
}

/**
 * Parse the CommonLit library HTML page to extract text listings.
 * Tries multiple patterns in order of reliability.
 */
function parseLibraryHtml(html: string): CommonLitText[] {
  const texts: CommonLitText[] = [];

  // Pattern 1: JSON data embedded in script tags (window.appData)
  const appDataMatch = html.match(/window\.appData\s*=\s*(\{[\s\S]*?\});/);
  if (appDataMatch) {
    try {
      const appData = JSON.parse(appDataMatch[1]);
      const textsData =
        appData.texts || appData.library || appData.catalog || [];
      for (const t of textsData) {
        texts.push({
          id: t.id || "",
          title: t.title || "Untitled",
          author: t.author || null,
          url: t.url || `${COMMONLIT_BASE_URL}/texts/${t.id}`,
          gradesMin: t.grades_min || 6,
          gradesMax: t.grades_max || 12,
          themes: t.themes || [],
          isPublic: t.is_public ?? true,
          excerpt: t.excerpt || t.description,
        });
      }
      if (texts.length > 0) return texts;
    } catch {
      // JSON parse failed, continue to other patterns
    }
  }

  // Pattern 1b: Next.js __NEXT_DATA__
  const nextDataMatch = html.match(
    /<script\b[^>]*?\bid\s*=\s*["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i
  );
  if (nextDataMatch) {
    try {
      const nextData = JSON.parse(nextDataMatch[1].trim());
      const pageProps = nextData.props?.pageProps;
      const textsData =
        pageProps?.texts ||
        pageProps?.library ||
        pageProps?.catalog ||
        pageProps?.initialTexts ||
        [];
      for (const t of textsData) {
        texts.push({
          id: t.id || t.slug || "",
          title: t.title || "Untitled",
          author: t.author || null,
          url:
            t.url ||
            (t.slug
              ? `${COMMONLIT_BASE_URL}/texts/${t.slug}`
              : `${COMMONLIT_BASE_URL}/texts/${t.id}`),
          gradesMin: t.grades_min || t.gradeMin || 6,
          gradesMax: t.grades_max || t.gradeMax || 12,
          themes: t.themes || t.categories || t.tags || [],
          isPublic: t.is_public ?? t.isPublic ?? true,
          excerpt: t.excerpt || t.description || t.summary,
        });
      }
      if (texts.length > 0) return texts;
    } catch {
      // Continue
    }
  }

  // Pattern 1c: Hydration data (window.__INITIAL_STATE__ or __PRELOADED_STATE__)
  const stateMatch =
    html.match(/window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\});/) ||
    html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/);
  if (stateMatch) {
    try {
      const state = JSON.parse(stateMatch[1]);
      const textsData =
        state.texts ||
        state.library ||
        state.catalog ||
        state.entities?.texts ||
        [];
      for (const t of textsData) {
        texts.push({
          id: t.id || "",
          title: t.title || "Untitled",
          author: t.author || null,
          url: t.url || `${COMMONLIT_BASE_URL}/texts/${t.id}`,
          gradesMin: t.grades_min || 6,
          gradesMax: t.grades_max || 12,
          themes: t.themes || [],
          isPublic: t.is_public ?? true,
          excerpt: t.excerpt || t.description,
        });
      }
      if (texts.length > 0) return texts;
    } catch {
      // Continue
    }
  }

  // Pattern 2: Look for data attributes on elements
  const dataAttrRegex =
    /data-text-id="([^"]+)".*?data-title="([^"]+)".*?data-author="([^"]*)"/;
  let match = dataAttrRegex.exec(html);
  while (match !== null) {
    const id = match[1];
    const title = match[2];
    const author = match[3];
    const gradesMatch = html
      .slice(match.index, match.index + 500)
      .match(
        /data-grades="([^"]+)"|class="[^"]*grade[^"]*"[^>]*>(\d+)-(\d+)/
      );
    let gradesMin = 6,
      gradesMax = 12;
    if (gradesMatch) {
      if (gradesMatch[1]) {
        const parts = gradesMatch[1].split("-");
        gradesMin = parseInt(parts[0], 10) || 6;
        gradesMax = parseInt(parts[1], 10) || 12;
      } else {
        gradesMin = parseInt(gradesMatch[2], 10) || 6;
        gradesMax = parseInt(gradesMatch[3], 10) || 12;
      }
    }

    texts.push({
      id,
      title: decodeHtmlEntities(title),
      author: author ? decodeHtmlEntities(author) : null,
      url: `${COMMONLIT_BASE_URL}/texts/${id}`,
      gradesMin,
      gradesMax,
      themes: [],
      isPublic: true,
    });
    match = dataAttrRegex.exec(html);
  }

  if (texts.length > 0) return texts;

  // Pattern 3: Look for anchor tags with text links
  const linkRegex =
    /<a[^>]+href="(\/texts\/[^"]+)"[^>]*>.*?<span[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)<\/span>/;
  match = linkRegex.exec(html);
  while (match !== null) {
    const id = match[1].replace("/texts/", "").replace(/\/$/, "");
    texts.push({
      id,
      title: decodeHtmlEntities(match[2].replace(/<[^>]+>/g, "")),
      author: null,
      url: `${COMMONLIT_BASE_URL}${match[1]}`,
      gradesMin: 6,
      gradesMax: 12,
      themes: [],
      isPublic: true,
    });
    match = linkRegex.exec(html);
  }

  // Pattern 4: Look for article cards with structured data
  const cardRegex =
    /<article\b[^>]*>.*?<a\b[^>]*?href="(\/texts\/[^"]+)"[^>]*>.*?<h[1-6][^>]*>([^<]+)<\/h[1-6]>.*?<\/article>/i;
  let cardMatch: RegExpExecArray | null;
  const cardHtml = html;
  while ((cardMatch = cardRegex.exec(cardHtml)) !== null) {
    const id = cardMatch[1].replace("/texts/", "").replace(/\/$/, "");
    const title = decodeHtmlEntities(
      cardMatch[2].replace(/<[^>]+>/g, "").trim()
    );
    if (title && !texts.some((t) => t.id === id)) {
      texts.push({
        id,
        title,
        author: null,
        url: `${COMMONLIT_BASE_URL}${cardMatch[1]}`,
        gradesMin: 6,
        gradesMax: 12,
        themes: [],
        isPublic: true,
      });
    }
  }

  return texts;
}

// ---------------------------------------------------------------------------
// Text Detail Extraction
// ---------------------------------------------------------------------------

/**
 * Extract content from a text detail page using multiple strategies.
 * Returns the best available content with the strategy that produced it.
 */
function extractTextContent(html: string): ExtractedContent {
  let fullText: string | undefined;
  let excerpt: string | undefined;
  let strategy: ExtractionStrategy = "none";

  // Strategy 1: <article> tag (any class or no class)
  const articleHtml = findFirstBlock(html, "article");
  if (articleHtml && articleHtml.length > 200) {
    fullText = htmlToText(articleHtml);
    strategy = "article";
  }

  // Strategy 2: <div class="passage"> or <div id="passage">
  if (!fullText) {
    const divHtml = findDivByClassOrId(html, ["passage"], "class");
    if (divHtml && divHtml.length > 200) {
      fullText = htmlToText(divHtml);
      strategy = "div-passage";
    }
  }
  if (!fullText) {
    const divHtml = findDivByClassOrId(html, ["passage"], "id");
    if (divHtml && divHtml.length > 200) {
      fullText = htmlToText(divHtml);
      strategy = "div-passage";
    }
  }

  // Strategy 3: <div class="text-content"> or <div id="text-content">
  if (!fullText) {
    const divHtml = findDivByClassOrId(html, ["text-content"], "class");
    if (divHtml && divHtml.length > 200) {
      fullText = htmlToText(divHtml);
      strategy = "div-text-content";
    }
  }
  if (!fullText) {
    const divHtml = findDivByClassOrId(html, ["text-content"], "id");
    if (divHtml && divHtml.length > 200) {
      fullText = htmlToText(divHtml);
      strategy = "div-text-content";
    }
  }

  // Strategy 4: <section class="story">
  if (!fullText) {
    const sectionHtml = findSectionByClass(html, ["story"]);
    if (sectionHtml && sectionHtml.length > 200) {
      fullText = htmlToText(sectionHtml);
      strategy = "section-story";
    }
  }

  // Strategy 5: JSON-LD articleBody
  if (!fullText) {
    const jsonBody = extractJsonLdArticleBody(html);
    if (jsonBody && jsonBody.length > 200) {
      fullText = jsonBody;
      strategy = "json-ld";
    }
  }

  // Strategy 6: window.__PRELOADED_STATE__ / window.appData
  if (!fullText) {
    const preloadedMatch = html.match(
      /window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\});/
    );
    if (preloadedMatch) {
      try {
        const state = JSON.parse(preloadedMatch[1]);
        const textData = state.text || state.currentText || {};
        if (textData.content && textData.content.length > 200) {
          fullText = textData.content;
          strategy = "preloaded-state";
        } else if (textData.text && textData.text.length > 200) {
          fullText = textData.text;
          strategy = "preloaded-state";
        }
        if (textData.author && !excerpt) {
          // Will be merged into result later
        }
      } catch {
        // Not valid JSON
      }
    }
  }

  // Strategy 7: og:description as excerpt fallback
  if (!excerpt) {
    const ogDesc = extractOgDescription(html);
    if (ogDesc && ogDesc.length > 50) {
      excerpt = ogDesc;
      if (!fullText) strategy = "og-description";
    }
  }

  // Strategy 8: meta description
  if (!excerpt) {
    const metaDescMatch = html.match(
      /<meta\b[^>]*?\bname\s*=\s*["']description["'][^>]*?\bcontent\s*=\s*("([^"]*)"|'([^']*)')[^>]*>/i
    );
    if (metaDescMatch) {
      const raw = metaDescMatch[2] ?? metaDescMatch[3] ?? "";
      const decoded = decodeHtmlEntities(raw).trim();
      if (decoded.length > 50) excerpt = decoded;
    }
  }

  return { fullText, excerpt, strategy };
}

/**
 * Fetch a single text's detail page to extract content and metadata.
 */
async function fetchTextDetails(
  text: CommonLitText
): Promise<Partial<CommonLitText & { html?: string; strategy?: ExtractionStrategy }>> {
  const result: Partial<CommonLitText & { html?: string; strategy?: ExtractionStrategy }> =
    { ...text };

  try {
    const html = await fetchHtml(text.url);
    result.html = html;

    const extracted = extractTextContent(html);

    if (extracted.fullText) {
      result.fullText = extracted.fullText;
    }
    if (extracted.excerpt) {
      result.excerpt = extracted.excerpt;
    }
    result.strategy = extracted.strategy;

    // Also try __PRELOADED_STATE__ for metadata enrichment
    const preloadedMatch = html.match(
      /window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\});/
    );
    if (preloadedMatch) {
      try {
        const state = JSON.parse(preloadedMatch[1]);
        const textData = state.text || state.currentText || {};
        result.fullText = result.fullText || textData.content || textData.text;
        if (textData.author) result.author = textData.author;
        if (textData.themes) result.themes = textData.themes;
      } catch {
        // Not valid JSON
      }
    }
  } catch (err) {
    console.log(
      `  Warning: Could not fetch details for ${text.title}: ${(err as Error).message}`
    );
  }

  return result;
}

// ---------------------------------------------------------------------------
// Content Completeness
// ---------------------------------------------------------------------------

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function determineCompleteness(
  fullText: string | undefined,
  excerpt: string | undefined
): string {
  if (fullText && countWords(fullText) > 800) {
    return "full";
  }
  if (fullText && countWords(fullText) > 200) {
    return "partial";
  }
  if (excerpt && countWords(excerpt) > 200) {
    return "partial";
  }
  return "excerpt";
}

// ---------------------------------------------------------------------------
// Database Operations
// ---------------------------------------------------------------------------

async function upsertTopic(
  supabase: ReturnType<typeof createClient>,
  data: TopicUpsertData
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("reading_topics").upsert(
    {
      topic_key: data.topic_key,
      title: data.title,
      author: data.author,
      language: data.language,
      category: data.category,
      source: data.source,
      source_url: data.source_url,
      source_text: data.source_text,
      source_image_url: data.source_image_url,
      source_inline_image_urls: data.source_inline_image_urls,
      grade_level: data.grade_level,
      target_grades: data.target_grades,
      status: data.status,
      content_completeness: data.content_completeness,
      metadata: data.metadata,
    },
    { onConflict: "topic_key" }
  );

  if (error) {
    console.error(`  Database error: ${error.message}`);
    return false;
  }

  return true;
}

/**
 * Check if topic already exists in database
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function topicExists(supabase: any, topicKey: string): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("reading_topics")
    .select("topic_key")
    .eq("topic_key", topicKey)
    .maybeSingle();

  return !!data;
}

// ---------------------------------------------------------------------------
// Main Scraper Logic
// ---------------------------------------------------------------------------

/**
 * Generate topic_key from text metadata
 */
function generateTopicKey(title: string, gradeMin: number): string {
  const titleSlug = slugify(title);
  return `commonlit-${titleSlug}-g${gradeMin}`;
}

/**
 * Determine primary category from themes
 */
function deriveCategory(themes: string[]): string {
  if (!themes || themes.length === 0) return "literature";

  const theme = themes[0].toLowerCase();

  const categoryMap: Record<string, string> = {
    fiction: "fiction",
    "short story": "fiction",
    drama: "drama",
    poetry: "poetry",
    "non-fiction": "nonfiction",
    nonfiction: "nonfiction",
    "informational text": "nonfiction",
    informational: "nonfiction",
    biography: "biography",
    memoir: "biography",
    autobiography: "biography",
    history: "history",
    "social studies": "social-studies",
    science: "science",
    "current events": "current-events",
    news: "current-events",
  };

  for (const [key, category] of Object.entries(categoryMap)) {
    if (theme.includes(key)) {
      return category;
    }
  }

  return "literature";
}

/**
 * Process a single text and prepare for database upsert.
 * Returns the enriched text data and processing result.
 */
async function processText(
  text: CommonLitText,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  dryRun: boolean
): Promise<{ success: boolean; topicKey: string; strategy?: ExtractionStrategy }> {
  const topicKey = generateTopicKey(text.title, text.gradesMin);

  // Get details if public (for full content)
  let enrichedText: CommonLitText | Partial<CommonLitText> = text;
  let detailsHtml: string | undefined;
  if (text.isPublic) {
    const details = await fetchTextDetails(text);
    enrichedText = { ...text, ...details };
    detailsHtml = details.html;
  }

  // Extract cover image (best-effort)
  const images = detailsHtml
    ? extractImages(detailsHtml)
    : { cover: null, inline: [] };

  const textData = enrichedText as CommonLitText;
  const sourceText = textData.fullText || textData.excerpt || null;
  const completeness = determineCompleteness(textData.fullText, textData.excerpt);

  // Check if already exists (skip in dry-run)
  if (!dryRun) {
    const exists = await topicExists(supabase, topicKey);
    if (exists) {
      console.log(`  SKIP (exists): ${topicKey}`);
      return { success: true, topicKey, strategy: textData.strategy };
    }
  }

  const upsertData: TopicUpsertData = {
    topic_key: topicKey,
    title: textData.title || "Untitled",
    author: textData.author ?? null,
    language: "en",
    category: deriveCategory(textData.themes || []),
    source: "commonlit",
    source_url: textData.url || "",
    source_text: sourceText,
    source_image_url: images.cover,
    source_inline_image_urls: images.inline || null,
    grade_level: textData.gradesMin || 6,
    target_grades: [textData.gradesMin || 6, textData.gradesMax || 12],
    status: textData.isPublic !== false ? "active" : "pending",
    content_completeness: completeness,
    metadata: {
      commonlit_id: textData.id || "",
      grades_max: textData.gradesMax || 12,
      themes: textData.themes || [],
      has_full_content: !!textData.fullText,
      excerpt: textData.excerpt || null,
      extraction_strategy: textData.strategy || "none",
      content_completeness: completeness,
    },
  };

  if (dryRun) {
    console.log(`  [DRY-RUN] Would upsert: ${topicKey}`);
    console.log(`    Title: ${upsertData.title}`);
    console.log(`    Author: ${upsertData.author || "unknown"}`);
    console.log(`    Grades: ${upsertData.target_grades.join("-")}`);
    console.log(`    Category: ${upsertData.category}`);
    console.log(`    Has content: ${!!upsertData.source_text}`);
    console.log(`    Completeness: ${upsertData.content_completeness}`);
    console.log(`    Strategy: ${textData.strategy || "none"}`);
    console.log(`    URL: ${upsertData.source_url}`);
    return { success: true, topicKey, strategy: textData.strategy };
  }

  const success = await upsertTopic(supabase, upsertData);
  if (success) {
    console.log(`  Added: ${topicKey} (${upsertData.category})`);
  }

  return { success, topicKey, strategy: textData.strategy };
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  console.log("=== CommonLit Scraper ===\n");

  const { dryRun, limit } = parseArgs();

  if (dryRun) {
    console.log("Mode: DRY-RUN (no database changes)\n");
  }

  validateEnv();

  // Create Supabase client (service role for writing)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Fetch library catalog
  console.log(`Fetching library (limit: ${limit})...`);
  let texts = await fetchLibraryCatalog();
  console.log(`Found ${texts.length} texts in catalog\n`);

  // Filter to public texts only (for better content)
  const publicTexts = texts.filter((t) => t.isPublic);
  console.log(`Public texts: ${publicTexts.length}`);
  console.log(`Private texts: ${texts.length - publicTexts.length}\n`);

  // Apply limit
  const textsToProcess = publicTexts.slice(0, limit);
  if (textsToProcess.length === 0) {
    console.log("No public texts found to process. Exiting.");
    return;
  }

  console.log(`Processing ${textsToProcess.length} texts with concurrency ${DETAIL_CONCURRENCY}...\n`);

  const pacer = new Pacer(DETAIL_CONCURRENCY);

  // Process texts in parallel with concurrency limit
  const results = await Promise.all(
    textsToProcess.map(async (text, index) => {
      const position = index + 1;
      return pacer.run(async () => {
        process.stdout.write(`[${position}/${textsToProcess.length}] ${text.title}... `);
        try {
          const result = await processText(text, supabase, dryRun);
          if (result.success) {
            console.log(`OK (${result.strategy || "no-fetch"})`);
          } else {
            console.log("FAIL (upsert failed)");
          }
          return { success: result.success, error: null as Error | null };
        } catch (err) {
          console.log(`FAIL: ${(err as Error).message}`);
          return { success: false, error: err as Error };
        }
      });
    })
  );

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log("\n=== SUMMARY ===");
  console.log(`Processed: ${textsToProcess.length}`);
  console.log(`Succeeded: ${succeeded}`);
  console.log(`Failed: ${failed}`);

  if (dryRun) {
    console.log("\n(Dry-run mode - no actual database changes were made)");
  }
}

// ---------------------------------------------------------------------------
// Entry Point
// ---------------------------------------------------------------------------

main().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});
