#!/usr/bin/env npx tsx

/**
 * ICDL (International Children's Digital Library) Scraper
 *
 * Scrapes children's books from childrenslibrary.org and upserts them
 * into the reading_topics table.
 *
 * Usage:
 *   npx tsx scripts/reading/scrapers/icdl-scraper.ts --lang zh --limit 20
 *   npx tsx scripts/reading/scrapers/icdl-scraper.ts --lang en --limit 50 --dry-run
 *
 * Environment variables:
 *   NEXT_PUBLIC_SUPABASE_URL   (required)
 *   SUPABASE_SERVICE_ROLE_KEY  (required)
 */

import { chromium, type Browser, type Page } from "playwright";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { extractImages } from "../../../src/lib/reading/source-image-extractor";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BookInfo {
  bookKey: string;
  title: string;
  description: string | null;
  ageRange: string | null; // e.g., "4-8"
  language: "zh" | "en";
  sourceUrl: string;
  sourceImageUrl: string | null;
}

interface UpsertResult {
  topicKey: string;
  inserted: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

interface CliArgs {
  lang: "zh" | "en";
  limit: number;
  dryRun: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let lang: "zh" | "en" = "en";
  let limit = 50;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--lang" && i + 1 < args.length) {
      const val = args[++i];
      if (val === "zh" || val === "en") {
        lang = val;
      } else {
        console.error(`Unknown language: ${val}. Use 'zh' or 'en'.`);
        process.exit(1);
      }
    } else if (arg === "--limit" && i + 1 < args.length) {
      limit = parseInt(args[++i], 10);
      if (isNaN(limit) || limit < 1) {
        console.error("Limit must be a positive integer.");
        process.exit(1);
      }
    } else if (arg === "--dry-run") {
      dryRun = true;
    }
  }

  return { lang, limit, dryRun };
}

// ---------------------------------------------------------------------------
// Environment validation
// ---------------------------------------------------------------------------

function validateEnv(): void {
  const missing: string[] = [];
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");

  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(", ")}`);
    console.error("Set these in .env.local before running the scraper.");
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Category inference
// ---------------------------------------------------------------------------

function inferCategory(description: string | null, language: "zh" | "en"): string {
  if (!description) {
    return language === "zh" ? "文化" : "culture";
  }

  const desc = description.toLowerCase();

  if (language === "zh") {
    if (/成语|寓言|寓言故事/.test(desc)) return "成语故事";
    if (/历史|古代|朝代/.test(desc)) return "历史";
    if (/动物|森林|虫鸟|野兽/.test(desc)) return "寓言";
    if (/神话|传说|民间/.test(desc)) return "神话";
    return "文化";
  } else {
    if (/history|historical|ancient|civilization/.test(desc)) return "history";
    if (/animal|nature|forest|wildlife|nature/.test(desc)) return "nature";
    if (/science|experiment|technology|math/.test(desc)) return "science";
    if (/folk|tale|myth|legend/.test(desc)) return "folklore";
    return "culture";
  }
}

// ---------------------------------------------------------------------------
// Age to grade mapping
// ---------------------------------------------------------------------------

function ageToGradeLevel(ageRange: string | null): number[] {
  if (!ageRange) {
    return [3, 4]; // default to G3-4
  }

  // Parse age range like "4-8" or "6-9"
  const match = ageRange.match(/(\d+)-(\d+)/);
  if (!match) return [3, 4];

  const minAge = parseInt(match[1], 10);
  const maxAge = parseInt(match[2], 10);
  const avgAge = (minAge + maxAge) / 2;

  if (avgAge <= 6) return [1, 2];     // 4-6 years -> grade 1-2
  if (avgAge <= 8) return [3, 4];     // 6-9 years -> grade 3-4
  return [5, 6];                      // 9-12 years -> grade 5-6
}

// ---------------------------------------------------------------------------
// Browser setup with SSL bypass
// ---------------------------------------------------------------------------

async function createBrowser(): Promise<Browser> {
  const browser = await chromium.launch({ headless: true });
  return browser;
}

async function setupPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();

  // Additional SSL bypass via CDP
  await context.newPage(); // ensure we can use CDP

  return page;
}

// ---------------------------------------------------------------------------
// Scraping helpers
// ---------------------------------------------------------------------------

const BASE_URL = "https://www.childrenslibrary.org";

/**
 * Get the collection page URL for a specific language.
 */
function getCollectionUrl(language: "zh" | "en"): string {
  return `${BASE_URL}/icdl/?lang=${language}`;
}

/**
 * Scrape the book list page for a language.
 * Returns an array of { url, title } for each book link.
 */
async function scrapeBookList(page: Page, language: "zh" | "en"): Promise<Array<{ url: string; title: string }>> {
  const listUrl = getCollectionUrl(language);
  console.log(`Fetching book list: ${listUrl}`);

  try {
    await page.goto(listUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  } catch (err) {
    console.error(`Failed to load ${listUrl}: ${err}`);
    return [];
  }

  // Wait for book list to load (ICDL uses JavaScript rendering)
  try {
    await page.waitForSelector("a[href*='/book/'], .book-item, [class*='book']", { timeout: 15000 });
  } catch {
    console.warn("Book list selector not found, trying alternate selectors...");
  }

  // Try multiple selectors for book links
  const bookLinks: Array<{ url: string; title: string }> = [];

  // Selector 1: links containing /book/
  const links1 = await page.$$eval("a[href*='/book/']", (anchors) =>
    anchors.map((a) => {
      const el = a as HTMLAnchorElement;
      return { url: el.href || "", title: a.textContent?.trim() || "" };
    })
  );
  bookLinks.push(...links1);

  // Selector 2: data-book-key attributes
  const links2 = await page.$$eval("[data-book-key]", (els) =>
    els.map((el) => {
      const href = el.getAttribute("href") || el.getAttribute("data-book-key") || "";
      const title = el.textContent?.trim() || "";
      const fullUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;
      return { url: fullUrl, title };
    })
  );
  bookLinks.push(...links2);

  // Deduplicate by URL
  const seen = new Set<string>();
  const unique = bookLinks.filter((link) => {
    if (seen.has(link.url)) return false;
    seen.add(link.url);
    return true;
  });

  console.log(`Found ${unique.length} book links`);
  return unique;
}

/**
 * Scrape a single book page and extract metadata.
 */
async function scrapeBook(page: Page, bookUrl: string, language: "zh" | "en"): Promise<BookInfo | null> {
  try {
    await page.goto(bookUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  } catch (err) {
    console.warn(`Failed to load book page: ${bookUrl} — ${err}`);
    return null;
  }

  // Wait for content to render
  try {
    await page.waitForSelector("h1, [class*='title'], [class*='description']", { timeout: 10000 });
  } catch {
    // Continue with whatever we can extract
  }

  // Extract title
  let title = await page.$eval("h1", (el) => el.textContent?.trim() || "").catch(() => "");
  if (!title) {
    title = await page.$eval("[class*='title']", (el) => el.textContent?.trim() || "").catch(() => "");
  }
  if (!title) {
    title = await page.title().catch(() => "Unknown Book");
  }

  // Extract description
  let description: string | null = await page.$eval("[class*='description'], [class*='synopsis'], [class*='summary']", (el) => el.textContent?.trim() || null).catch(() => null);
  if (!description) {
    description = await page.$eval("meta[name='description']", (el) => el.getAttribute("content") || null).catch(() => null);
  }

  // Extract age range (look for patterns like "4-8", "Ages 4-8", etc.)
  const pageText = await page.content();
  const ageMatch = pageText.match(/(?:age[sd]?|适合年龄|适用年龄)\s*:?\s*(\d+)\s*[-–to]+\s*(\d+)/i) ||
                   pageText.match(/(\d+)\s*[-–to]+\s*(\d+)\s*(?:years?|岁)/i);

  let ageRange: string | null = null;
  if (ageMatch && ageMatch[1] && ageMatch[2]) {
    ageRange = `${ageMatch[1]}-${ageMatch[2]}`;
  }

  // Extract cover image from page HTML (best-effort)
  let sourceImageUrl: string | null = null;
  try {
    const images = extractImages(pageText);
    sourceImageUrl = images.cover;
  } catch {
    // best-effort — leave null
  }

  // Extract book key from URL
  const bookKeyMatch = bookUrl.match(/\/book\/([^\/\?]+)/);
  const bookKey = bookKeyMatch ? bookKeyMatch[1] : new URL(bookUrl).pathname.replace(/\//g, "-");

  return {
    bookKey,
    title,
    description,
    ageRange,
    language,
    sourceUrl: bookUrl,
    sourceImageUrl,
  };
}

// ---------------------------------------------------------------------------
// Batch scraping with rate limiting
// ---------------------------------------------------------------------------

async function scrapeBooks(
  page: Page,
  bookUrls: Array<{ url: string; title: string }>,
  limit: number,
  language: "zh" | "en",
  onProgress?: (current: number, total: number) => void
): Promise<BookInfo[]> {
  const books: BookInfo[] = [];
  const toScrape = bookUrls.slice(0, limit);

  for (let i = 0; i < toScrape.length; i++) {
    const { url, title } = toScrape[i];
    onProgress?.(i + 1, toScrape.length);

    // Progress indicator
    process.stdout.write(`[${i + 1}/${toScrape.length}] Scraping: ${title.substring(0, 40)}${title.length > 40 ? "..." : ""} `);

    const bookInfo = await scrapeBook(page, url, language);
    if (bookInfo) {
      books.push(bookInfo);
      console.log("OK");
    } else {
      console.log("SKIP");
    }

    // Rate limit: wait between requests
    if (i < toScrape.length - 1) {
      await page.waitForTimeout(1000); // 1 second delay between requests
    }
  }

  return books;
}

// ---------------------------------------------------------------------------
// Database upsert
// ---------------------------------------------------------------------------

async function upsertBooks(books: BookInfo[], dryRun: boolean): Promise<UpsertResult[]> {
  const results: UpsertResult[] = [];

  if (dryRun) {
    console.log("\n=== DRY RUN — no database changes will be made ===\n");
    for (const book of books) {
      console.log(`[DRY] Would upsert: ${book.bookKey} — "${book.title}"`);
      console.log(`       category: ${inferCategory(book.description, book.language)}`);
      console.log(`       grades: ${ageToGradeLevel(book.ageRange).join(", ")}`);
      results.push({ topicKey: book.bookKey, inserted: true });
    }
    return results;
  }

  const supabase = await createServiceRoleClient();

  for (const book of books) {
    const topicKey = `icdl-${book.language}-${book.bookKey}`;
    const category = inferCategory(book.description, book.language);
    const grades = ageToGradeLevel(book.ageRange);

    const { error } = await supabase
      .from("reading_topics")
      .upsert(
        {
          topic_key: topicKey,
          language: book.language,
          title: book.title,
          source_text: book.description,
          source_url: book.sourceUrl,
          source_image_url: book.sourceImageUrl,
          category,
          grade_level: grades[0],
          target_grades: grades,
          source: "icdl",
          status: "active",
        },
        { onConflict: "topic_key" }
      );

    if (error) {
      console.error(`Failed to upsert ${topicKey}: ${error.message}`);
      results.push({ topicKey, inserted: false, error: error.message });
    } else {
      results.push({ topicKey, inserted: true });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("=== ICDL Scraper ===\n");

  const args = parseArgs();
  console.log(`Language:   ${args.lang}`);
  console.log(`Limit:      ${args.limit}`);
  console.log(`Dry run:    ${args.dryRun}`);
  console.log("");

  validateEnv();

  const browser = await createBrowser();
  const page = await setupPage(browser);

  try {
    // Step 1: Get book list
    const bookList = await scrapeBookList(page, args.lang);

    if (bookList.length === 0) {
      console.error("No books found. The site structure may have changed.");
      console.error("Please check the ICDL website manually.");
      await browser.close();
      process.exit(1);
    }

    console.log(`\nFound ${bookList.length} books total, scraping up to ${args.limit}...\n`);

    // Step 2: Scrape individual books
    const books = await scrapeBooks(
      page,
      bookList,
      args.limit,
      args.lang,
      (current, total) => {
        // Progress callback
      }
    );

    console.log(`\nScraped ${books.length} books successfully.`);

    // Step 3: Upsert to database
    console.log("\nUpserting to reading_topics table...\n");
    const upsertResults = await upsertBooks(books, args.dryRun);

    const inserted = upsertResults.filter((r) => r.inserted).length;
    const failed = upsertResults.filter((r) => !r.inserted).length;

    console.log(`\n=== SUMMARY ===`);
    console.log(`Total scraped:  ${books.length}`);
    console.log(`Upserted:       ${inserted}`);
    console.log(`Failed:         ${failed}`);

    await browser.close();

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error("\nFatal error:", err);
    await browser.close();
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("\nFatal error:", message);
  process.exit(1);
});