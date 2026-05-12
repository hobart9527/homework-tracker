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
  grade_level: number;
  target_grades: number[];
  status: string;
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const COMMONLIT_BASE_URL = "https://www.commonlit.org";
const COMMONLIT_LIBRARY_URL = "https://www.commonlit.org/our-library";
const REQUEST_DELAY_MS = 2500; // 2.5 seconds between requests
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

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

async function fetchWithDelay(
  url: string,
  options: RequestInit = {}
): Promise<string> {
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

// ---------------------------------------------------------------------------
// CommonLit API / Page Scraping
// ---------------------------------------------------------------------------

/**
 * Fetch the CommonLit library page and parse the catalog of texts.
 * CommonLit may require authentication for library access.
 */
async function fetchLibraryCatalog(): Promise<CommonLitText[]> {
  console.log("Fetching CommonLit library catalog...");

  // CommonLit uses an API endpoint for fetching texts
  // Try the public API first
  const apiUrl =
    "https://www.commonlit.org/api/v1/library/texts/?format=json&is_public=true";

  try {
    const html = await fetchWithDelay(apiUrl);
    // Check if login is required
    if (html.includes('action="/user/login"') || (html.includes('"Login"') && html.includes('password'))) {
      console.log("  Note: CommonLit library requires authentication");
      console.log("  Using sample data for demonstration (remove in production)");
      return getSampleTexts();
    }
    // If API returns JSON-like content, parse it
    return parseLibraryApiResponse(html);
  } catch {
    console.log("API endpoint not available, trying page scraping...");
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
 * Fetch and parse the library page directly (fallback)
 */
async function fetchLibraryFromPage(): Promise<CommonLitText[]> {
  console.log("Fetching library page...");
  try {
    const html = await fetchWithDelay(COMMONLIT_LIBRARY_URL);
    if (isLoginRequired(html)) {
      console.log("  Note: CommonLit library requires authentication");
      console.log("  Using sample data for demonstration (remove in production)");
      return getSampleTexts();
    }
    return parseLibraryHtml(html);
  } catch (err) {
    console.log("  Library page not accessible, using sample data");
    return getSampleTexts();
  }
}

/**
 * Check if response indicates login is required
 */
function isLoginRequired(html: string): boolean {
  return (
    html.includes('action="/user/login"') ||
    (html.includes('"Login"') && html.includes('password'))
  );
}

/**
 * Return sample CommonLit texts when API is unavailable.
 * Replace with real data from CommonLit API when authentication is available.
 */
function getSampleTexts(): CommonLitText[] {
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
      excerpt: "A young couple sacrifices their most treasured possessions to buy gifts for each other.",
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
      excerpt: "A narrator insists on their sanity while describing a murder they committed.",
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
      excerpt: "A passionate defense of nonviolent protest against racial injustice.",
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
      excerpt: "A Native American author reflects on learning to read and the power of books.",
    },
  ];
}

/**
 * Parse the CommonLit library HTML page to extract text listings
 */
function parseLibraryHtml(html: string): CommonLitText[] {
  const texts: CommonLitText[] = [];

  // CommonLit uses various HTML structures; try multiple patterns
  // Pattern 1: JSON data embedded in script tags
  const scriptMatch = html.match(/window\.appData\s*=\s*(\{[\s\S]*?\});/);
  if (scriptMatch) {
    try {
      const appData = JSON.parse(scriptMatch[1]);
      const textsData = appData.texts || appData.library || appData.catalog || [];
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

  // Pattern 2: Look for data attributes on elements
  const dataAttrRegex = /data-text-id="([^"]+)".*?data-title="([^"]+)".*?data-author="([^"]*)"/;
  let match = dataAttrRegex.exec(html);
  while (match !== null) {
    const id = match[1];
    const title = match[2];
    const author = match[3];
    const gradesMatch = html.slice(match.index, match.index + 500).match(
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
      isPublic: true, // Public page listing
    });
    // Reset lastIndex for non-global regex
    match = dataAttrRegex.exec(html);
  }

  if (texts.length > 0) return texts;

  // Pattern 3: Look for anchor tags with text links
  const linkRegex = /<a[^>]+href="(\/texts\/[^"]+)"[^>]*>.*?<span[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)<\/span>/;
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

  return texts;
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

/**
 * Fetch a single text's detail page to extract content and metadata
 */
async function fetchTextDetails(
  text: CommonLitText
): Promise<Partial<CommonLitText>> {
  const result: Partial<CommonLitText> = { ...text };

  try {
    const html = await fetchWithDelay(text.url);

    // Try to extract full text content
    // CommonLit may store text in various locations
    const contentMatch = html.match(
      /<article[^>]*class="[^"]*(?:text-content|passage|story)[^"]*"[^>]*>([\s\S]*?)<\/article>/i
    );
    if (contentMatch && contentMatch[1]) {
      result.fullText = stripHtml(contentMatch[1]);
    }

    // Try JSON data
    const jsonMatch = html.match(/window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\});/);
    if (jsonMatch) {
      try {
        const state = JSON.parse(jsonMatch[1]);
        const textData = state.text || state.currentText || {};
        result.fullText = result.fullText || textData.content || textData.text;
        if (textData.author) result.author = textData.author;
        if (textData.themes) result.themes = textData.themes;
      } catch {
        // Not valid JSON
      }
    }

    // Extract excerpt if not already set
    if (!result.excerpt) {
      const excerptMatch = html.match(
        /<p[^>]*class="[^"]*(?:excerpt|description|summary)[^"]*"[^>]*>([\s\S]*?)<\/p>/i
      );
      if (excerptMatch) {
        result.excerpt = stripHtml(excerptMatch[1]);
      }
    }
  } catch (err) {
    console.log(`  Warning: Could not fetch details for ${text.title}: ${(err as Error).message}`);
  }

  return result;
}

/**
 * Strip HTML tags from content
 */
function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
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
      grade_level: data.grade_level,
      target_grades: data.target_grades,
      status: data.status,
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
    "informational": "nonfiction",
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
 * Process a single text and prepare for database upsert
 */
async function processText(
  text: CommonLitText,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  dryRun: boolean
): Promise<boolean> {
  const topicKey = generateTopicKey(text.title, text.gradesMin);

  // Get details if public (for full content)
  let enrichedText: CommonLitText | Partial<CommonLitText> = text;
  if (text.isPublic) {
    const details = await fetchTextDetails(text);
    enrichedText = { ...text, ...details };
    await delay(REQUEST_DELAY_MS);
  }

  // Prepare source_text
  const sourceText = (enrichedText as CommonLitText).fullText || (enrichedText as CommonLitText).excerpt || null;

  // Check if already exists (skip in dry-run)
  if (!dryRun) {
    const exists = await topicExists(supabase, topicKey);
    if (exists) {
      console.log(`  SKIP (exists): ${topicKey}`);
      return true;
    }
  }

  // Cast to CommonLitText to access required fields with fallbacks
  const textData = enrichedText as CommonLitText;
  const upsertData: TopicUpsertData = {
    topic_key: topicKey,
    title: textData.title || "Untitled",
    author: textData.author ?? null,
    language: "en",
    category: deriveCategory(textData.themes || []),
    source: "commonlit",
    source_url: textData.url || "",
    source_text: sourceText,
    grade_level: textData.gradesMin || 6,
    target_grades: [textData.gradesMin || 6, textData.gradesMax || 12],
    status: textData.isPublic !== false ? "active" : "pending",
    metadata: {
      commonlit_id: textData.id || "",
      grades_max: textData.gradesMax || 12,
      themes: textData.themes || [],
      has_full_content: !!(textData as CommonLitText).fullText,
      excerpt: textData.excerpt || null,
    },
  };

  if (dryRun) {
    console.log(`  [DRY-RUN] Would upsert: ${topicKey}`);
    console.log(`    Title: ${upsertData.title}`);
    console.log(`    Author: ${upsertData.author || "unknown"}`);
    console.log(`    Grades: ${upsertData.target_grades.join("-")}`);
    console.log(`    Category: ${upsertData.category}`);
    console.log(`    Has content: ${!!upsertData.source_text}`);
    console.log(`    URL: ${upsertData.source_url}`);
    return true;
  }

  const success = await upsertTopic(supabase, upsertData);
  if (success) {
    console.log(`  Added: ${topicKey} (${upsertData.category})`);
  }

  return success;
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

  console.log(`Processing ${textsToProcess.length} texts...\n`);

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  for (const text of textsToProcess) {
    processed++;
    process.stdout.write(`[${processed}/${textsToProcess.length}] ${text.title}... `);

    try {
      const success = await processText(text, supabase, dryRun);
      if (success) succeeded++;
      else failed++;

      // Rate limiting
      if (processed < textsToProcess.length) {
        await delay(REQUEST_DELAY_MS);
      }
    } catch (err) {
      console.log(`FAIL: ${(err as Error).message}`);
      failed++;
    }
  }

  console.log("\n=== SUMMARY ===");
  console.log(`Processed: ${processed}`);
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