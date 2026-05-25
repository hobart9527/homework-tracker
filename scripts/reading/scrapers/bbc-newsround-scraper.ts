#!/usr/bin/env npx tsx

/**
 * BBC Newsround Scraper
 *
 * Scrapes kids news articles from BBC Newsround (ages 6-12) and upserts them
 * into the reading_topics table.
 *
 * Anti-blocking: rotating User-Agents, pre-request jitter, exponential-backoff
 * retries, batch-level jitter, capped concurrency.
 *
 * Usage:
 *   npx tsx scripts/reading/scrapers/bbc-newsround-scraper.ts [--dry-run] [--limit N]
 *
 * Environment:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { extractImages } from "../../../src/lib/reading/source-image-extractor";

config({ path: ".env.local" });

// ---------------------------------------------------------------------------
// Rotating User-Agents (10 realistic browsers)
// ---------------------------------------------------------------------------

const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:126.0) Gecko/20100101 Firefox/126.0",
  "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
];

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// ---------------------------------------------------------------------------
// fetchWithRetry: rotating UA + random delay + exponential backoff
// ---------------------------------------------------------------------------

async function randomDelay(min: number, max: number): Promise<void> {
  const ms = min + Math.random() * (max - min);
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(
  url: string,
  options?: { timeoutMs?: number }
): Promise<string> {
  const timeout = options?.timeoutMs ?? 30_000;
  const maxRetries = 3;
  const retryDelays = [1_000, 2_000, 4_000];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Random pre-request delay (500-2000ms)
      await randomDelay(500, 2000);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": randomUA(),
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      clearTimeout(timer);

      // Retry on 429 (rate-limit) and 5xx (server errors)
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = res.headers.get("retry-after");
        const wait = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : retryDelays[attempt] ?? 4_000;
        if (attempt < maxRetries) {
          console.log(
            `  Retry ${attempt + 1}/${maxRetries} after ${wait}ms (HTTP ${res.status})`
          );
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        throw new Error(`HTTP ${res.status}: ${url}`);
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${url}`);
      }

      return await res.text();
    } catch (err) {
      // Network errors / timeouts also retry
      if (attempt < maxRetries) {
        const delay = retryDelays[attempt] ?? 4_000;
        console.log(
          `  Retry ${attempt + 1}/${maxRetries} after ${delay}ms: ${(err as Error).message}`
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }

  throw new Error(`Failed after ${maxRetries} retries: ${url}`);
}

// ---------------------------------------------------------------------------
// RSS XML parsing (no external deps)
// ---------------------------------------------------------------------------

interface RssItem {
  link: string;
}

function parseRssItems(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  const linkPlainRe = /<link>([^<]+)<\/link>/i;
  const linkCdataRe = /<link>\s*<!\[CDATA\[([^\]]+)\]\]>\s*<\/link>/i;

  let itemMatch: RegExpExecArray | null;
  while ((itemMatch = itemRe.exec(xml)) !== null) {
    const inner = itemMatch[1];
    // Try CDATA-wrapped link first, then plain
    const linkMatch = linkCdataRe.exec(inner) || linkPlainRe.exec(inner);
    if (linkMatch) {
      items.push({ link: linkMatch[1].trim() });
    }
  }
  return items;
}

// ---------------------------------------------------------------------------
// Article URL discovery
// ---------------------------------------------------------------------------

/** Extract numeric Newsround IDs from HTML (both RSS and homepage). */
function extractNewsroundIds(html: string): string[] {
  const re = /\/newsround\/(\d+)/g;
  const seen = new Set<string>();
  const ids: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const id = m[1];
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

/** Skip URLs for quizzes, video hubs, and special pages. */
function isSkipUrl(url: string): boolean {
  return /watch_newsround|videos\/|articles\//i.test(url);
}

// ---------------------------------------------------------------------------
// Article text / metadata extraction
// ---------------------------------------------------------------------------

function extractTitle(html: string): string {
  // og:title first
  const ogMatch = html.match(
    /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i
  );
  if (ogMatch) return ogMatch[1].trim();

  // Fallback to <title>, stripping BBC Newsround suffix
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) {
    return titleMatch[1]
      .replace(/\s*-\s*BBC\s+Newsround\s*$/i, "")
      .trim();
  }

  return "";
}

/** Extract paragraphs by BBC Newsround's CSS class pattern. */
function extractArticleText(html: string): string {
  const paragraphs: string[] = [];
  // BBC Newsround uses class="ssrcss-1q0x1qg-Paragraph ..." for article body p tags
  const pRe =
    /<p\b[^>]*class="ssrcss-1q0x1qg-Paragraph[^"]*"[^>]*>([\s\S]*?)<\/p>/gi;
  let m: RegExpExecArray | null;
  while ((m = pRe.exec(html)) !== null) {
    let inner = m[1].replace(/<[^>]+>/g, ""); // strip inner HTML
    inner = inner
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ");
    inner = inner.trim();
    if (inner) paragraphs.push(inner);
  }
  return paragraphs.join("\n\n");
}

/** Strip common BBC footer/attribution lines. */
function stripFooter(text: string): string {
  return text
    .split("\n")
    .filter(
      (line) =>
        !/^Copyright © 20\d{2} BBC/i.test(line.trim()) &&
        !/^The BBC is not responsible/i.test(line.trim()) &&
        !/^All the latest/i.test(line.trim())
    )
    .join("\n")
    .trim();
}

function contentCompleteness(text: string): "full" | "partial" | "excerpt" {
  if (text.length > 1000) return "full";
  if (text.length > 200) return "partial";
  return "excerpt";
}

// ---------------------------------------------------------------------------
// Category inference from text keywords
// ---------------------------------------------------------------------------

function inferCategory(text: string, title: string): string {
  const combined = (text + " " + title).toLowerCase();
  const rules: [RegExp, string][] = [
    [/sport|football|basketball|olympic|medal|match|tournament|champion/i, "sport"],
    [/space|nasa|planet|satellite|rocket|mission|astronaut|telescope/i, "science"],
    [/animal|wildlife|ocean|forest|climate|conservation|endangered|species|habitat/i, "nature"],
    [/history|ancient|century|war|king|queen|empire|archaeology|medieval/i, "history"],
    [/film|music|book|art|disney|celebrity|award|concert|museum|exhibition|festival/i, "culture"],
  ];
  for (const [pattern, category] of rules) {
    if (pattern.test(combined)) return category;
  }
  return "news";
}

// ---------------------------------------------------------------------------
// DB upsert (same pattern as dogo-scraper)
// ---------------------------------------------------------------------------

function makeUpserter(sb: any) {
  return async function upsertArticle(
    url: string,
    html: string,
    dryRun: boolean
  ): Promise<{ success: boolean; skipped: boolean; error?: string }> {
    const idMatch = url.match(/\/newsround\/(\d+)/);
    if (!idMatch) {
      return { success: false, skipped: false, error: "no numeric newsround ID in URL" };
    }

    const numericId = idMatch[1];
    const topicKey = `bbc-newsround-${numericId}`;

    // Check existence by source_url
    const { data: existing } = await sb
      .from("reading_topics")
      .select("source_url")
      .eq("source_url", url)
      .maybeSingle();

    if (existing) {
      console.log(`SKIP (exists): ${url}`);
      return { success: false, skipped: true };
    }

    if (dryRun) {
      console.log(`[DRY-RUN] Would add: ${topicKey} (${url})`);
      return { success: false, skipped: true };
    }

    // Extract
    const title = extractTitle(html);
    let sourceText = stripFooter(extractArticleText(html));
    const completeness = contentCompleteness(sourceText);
    const category = inferCategory(sourceText, title);

    // Extract cover image via shared utility
    let sourceImageUrl: string | null = null;
    try {
      const images = extractImages(html);
      sourceImageUrl = images.cover;
    } catch {
      // best-effort
    }

    const { error } = await sb.from("reading_topics").insert({
      topic_key: topicKey,
      language: "en",
      category,
      source: "bbc-newsround",
      source_url: url,
      source_text: sourceText || null,
      source_image_url: sourceImageUrl,
      content_completeness: completeness,
      status: "active",
      target_grades: [3, 6],
    });

    if (error) {
      console.log(`  Insert failed: ${error.message}`);
      return { success: false, skipped: false, error: error.message };
    }

    console.log(`  Added: ${topicKey} (${completeness}, ${category})`);
    return { success: true, skipped: false };
  };
}

// ---------------------------------------------------------------------------
// Concurrency helper (same pattern as dogo-scraper)
// ---------------------------------------------------------------------------

async function runInBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Main scraper
// ---------------------------------------------------------------------------

async function scrapeBbcNewsround(args: {
  dryRun: boolean;
  limit: number;
}): Promise<{ success: number; skipped: number; failed: number }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const sb = createClient(supabaseUrl, supabaseKey);
  const upsertArticle = makeUpserter(sb);

  // -----------------------------------------------------------------------
  // Phase 1: Discover articles (RSS + homepage, deduplicated)
  // -----------------------------------------------------------------------

  console.log("[bbc-newsround] Discovering articles from RSS feed and homepage...");
  const allIds = new Set<string>();

  // Source 1: RSS feed
  try {
    const rssXml = await fetchWithRetry(
      "https://feeds.bbci.co.uk/newsround/rss.xml"
    );
    const items = parseRssItems(rssXml);
    for (const item of items) {
      if (isSkipUrl(item.link)) continue;
      const ids = extractNewsroundIds(item.link);
      for (const id of ids) allIds.add(id);
    }
    console.log(`  RSS feed: ${allIds.size} articles found`);
  } catch (err) {
    console.warn(`  RSS feed failed: ${(err as Error).message}`);
  }

  // Source 2: Homepage HTML
  try {
    const html = await fetchWithRetry("https://www.bbc.co.uk/newsround");
    const ids = extractNewsroundIds(html);
    for (const id of ids) allIds.add(id);
    console.log(`  Homepage: ${ids.length} article links found`);
  } catch (err) {
    console.warn(`  Homepage failed: ${(err as Error).message}`);
  }

  const articleIds = Array.from(allIds).slice(0, args.limit);
  console.log(
    `[bbc-newsround] ${articleIds.length} unique articles to process (limit=${args.limit})`
  );

  if (articleIds.length === 0) {
    console.log("[bbc-newsround] No articles found. Exiting.");
    return { success: 0, skipped: 0, failed: 0 };
  }

  // -----------------------------------------------------------------------
  // Phase 2: Pre-check existence
  // -----------------------------------------------------------------------

  const existingUrls = new Set<string>();
  for (const id of articleIds) {
    const url = `https://www.bbc.co.uk/newsround/${id}`;
    const { data: existing } = await sb
      .from("reading_topics")
      .select("source_url")
      .eq("source_url", url)
      .maybeSingle();
    if (existing) existingUrls.add(url);
  }

  // -----------------------------------------------------------------------
  // Phase 3: Fetch + upsert with concurrency limit
  // -----------------------------------------------------------------------

  let success = 0;
  let skipped = 0;
  let failed = 0;

  // Dry-run: count what would be done
  if (args.dryRun) {
    for (const id of articleIds) {
      const url = `https://www.bbc.co.uk/newsround/${id}`;
      if (existingUrls.has(url)) {
        console.log(`SKIP (exists): ${url}`);
        skipped++;
      } else {
        console.log(`[DRY-RUN] Would add: bbc-newsround-${id} (${url})`);
        skipped++;
      }
    }
    console.log(
      `\n[bbc-newsround] Dry-run complete: ${skipped} skipped (${existingUrls.size} exist)`
    );
    return { success: 0, skipped, failed: 0 };
  }

  // Only non-existing articles
  const toFetch = articleIds.filter(
    (id) => !existingUrls.has(`https://www.bbc.co.uk/newsround/${id}`)
  );

  if (toFetch.length === 0) {
    console.log("[bbc-newsround] All articles already exist in DB.");
    return { success: 0, skipped: articleIds.length, failed: 0 };
  }

  // Batch with concurrency 3 + jitter between batches
  const urls = toFetch.map((id) => `https://www.bbc.co.uk/newsround/${id}`);

  await runInBatches(urls, 3, async (url) => {
    console.log(`Fetching: ${url}`);
    try {
      const html = await fetchWithRetry(url);
      const result = await upsertArticle(url, html, false);
      return result;
    } catch (err) {
      console.log(`  Failed: ${(err as Error).message}`);
      return { success: false, skipped: false, error: (err as Error).message };
    }
  }).then((results) => {
    for (const r of results) {
      if (r.success) success++;
      else if (r.skipped) skipped++;
      else failed++;
    }
  });

  // Add already-existing to skipped count
  skipped += existingUrls.size;

  console.log(
    `\n[bbc-newsround] Done: ${success} added, ${skipped} skipped, ${failed} failed`
  );
  return { success, skipped, failed };
}

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

function parseArgs(): { dryRun: boolean; limit: number } {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes("--dry-run"),
    limit: parseInt(
      args.find((a) => a.startsWith("--limit="))?.split("=")[1] || "20",
      10
    ),
  };
}

// ---------------------------------------------------------------------------
// Export for programmatic use
// ---------------------------------------------------------------------------

export async function scrape(options?: {
  dryRun?: boolean;
  limit?: number;
}): Promise<{ success: number; skipped: number; failed: number }> {
  return scrapeBbcNewsround({
    dryRun: options?.dryRun ?? false,
    limit: options?.limit ?? 20,
  });
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

const isEntryPoint = process.argv[1]?.includes("bbc-newsround-scraper");
if (isEntryPoint) {
  const args = parseArgs();
  scrapeBbcNewsround(args).catch(console.error);
}
