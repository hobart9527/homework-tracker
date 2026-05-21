#!/usr/bin/env npx tsx

/**
 * DOGO News Scraper
 *
 * Scrapes articles from dogonews.com (K-12 news for kids) and upserts them
 * into the reading_topics table.
 *
 * Usage:
 *   npx tsx scripts/reading/scrapers/dogo-scraper.ts [--dry-run] [--limit N]
 *
 * Environment:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { StealthScraper } from "../../../src/lib/reading/stealth-scraper";
import { extractImages } from "../../../src/lib/reading/source-image-extractor";

config({ path: ".env.local" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DogoArticle {
  url: string;
  category: string;
}

interface UpsertResult {
  topicKey: string;
  success: boolean;
  skipped: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

interface CliArgs {
  dryRun: boolean;
  limit: number;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes("--dry-run"),
    limit: parseInt(args.find((a) => a.startsWith("--limit="))?.split("=")[1] || "50", 10),
  };
}

// ---------------------------------------------------------------------------
// Hardcoded fallback articles (used when category auto-discovery fails)
// ---------------------------------------------------------------------------

const DOGO_ARTICLES: DogoArticle[] = [
  { url: "https://www.dogonews.com/2026/5/8/robot-outruns-humans-in-beijing-half-marathon", category: "时事" },
  { url: "https://www.dogonews.com/2026/5/7/georgia-battles-large-wildfires-amid-drought-conditions", category: "时事" },
  { url: "https://www.dogonews.com/2026/5/5/african-elephants-may-be-using-farm-crops-as-medicine", category: "自然" },
  { url: "https://www.dogonews.com/2026/4/29/emperor-penguins-face-risk-of-extinction-as-sea-ice-melts", category: "自然" },
  { url: "https://www.dogonews.com/2026/4/23/nasas-dart-spacecraft-changed-an-asteroids-orbit-around-the-sun", category: "科学" },
  { url: "https://www.dogonews.com/2026/4/21/giant-tortoises-return-to-galapagos-island-after-centuries", category: "自然" },
  { url: "https://www.dogonews.com/2026/4/20/how-the-netherlands-became-the-worlds-tulip-capital", category: "文化" },
  { url: "https://www.dogonews.com/2026/4/17/ai-helping-scientists-discover-new-antibiotics", category: "科学" },
  { url: "https://www.dogonews.com/2026/4/15/solar-panels-in-space-could-solve-earths-energy-needs", category: "科学" },
  { url: "https://www.dogonews.com/2026/4/10/the-worlds-oldest-person-celebrates-116th-birthday", category: "人物" },
];

async function discoverDogoArticles(scraper: StealthScraper): Promise<DogoArticle[]> {
  const categories = [
    { url: "https://www.dogonews.com/category/news", category: "时事" },
    { url: "https://www.dogonews.com/category/science", category: "科学" },
    { url: "https://www.dogonews.com/category/nature", category: "自然" },
    { url: "https://www.dogonews.com/category/people", category: "人物" },
    { url: "https://www.dogonews.com/category/culture", category: "文化" },
  ];

  const articles: DogoArticle[] = [];
  for (const cat of categories) {
    try {
      const result = await scraper.scrape(cat.url, { timeoutMs: 20000 });
      // Match article links: /YYYY/MM/DD/slug
      const linkPattern = /href="(\/20\d{2}\/\d{1,2}\/\d{1,2}\/[\w-]+\/?)"/gi;
      const seen = new Set(articles.map(a => a.url));
      let match;
      while ((match = linkPattern.exec(result.text)) !== null) {
        const url = "https://www.dogonews.com" + match[1].replace(/\/$/, "");
        if (!seen.has(url)) {
          seen.add(url);
          articles.push({ url, category: cat.category });
          if (articles.filter(a => a.category === cat.category).length >= 5) break;
        }
      }
      console.log(`[dogo] ${cat.category}: found ${articles.filter(a => a.category === cat.category).length} articles`);
    } catch (err) {
      console.warn(`[dogo] category page failed: ${cat.url} — ${(err as Error).message}`);
    }
  }
  return articles.length > 0 ? articles : DOGO_ARTICLES; // fallback to hardcoded list
}

// ---------------------------------------------------------------------------
// HTML body extraction (regex-based, no extra deps)
// ---------------------------------------------------------------------------

function stripBlock(html: string, tag: string): string {
  const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi");
  return html.replace(re, "");
}

function stripComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, "");
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&");
}

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

  s = s
    .split("\n")
    .map((line) => line.replace(/[ \t\r\f\v]+$/g, ""))
    .join("\n");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

function findFirstBlock(html: string, tag: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = html.match(re);
  return m ? m[1] : null;
}

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
      (t) => t === "content" || t === "article-body" || t === "article"
    );
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

function extractBody(html: string): { text: string; strategy: string } {
  const articleHtml = findFirstBlock(html, "article");
  if (articleHtml !== null) {
    return { text: htmlToText(articleHtml), strategy: "article" };
  }

  const divHtml = findContentDiv(html);
  if (divHtml !== null) {
    return { text: htmlToText(divHtml), strategy: "div-content" };
  }

  const bodyHtml = findFirstBlock(html, "body");
  if (bodyHtml !== null) {
    return { text: htmlToText(bodyHtml), strategy: "body" };
  }

  return { text: htmlToText(html), strategy: "body" };
}

function contentCompleteness(text: string): "full" | "partial" | "excerpt" {
  if (text.length > 1000) return "full";
  if (text.length > 200) return "partial";
  return "excerpt";
}

// ---------------------------------------------------------------------------
// Concurrency helper
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

async function scrapeDogoArticles(args: CliArgs): Promise<{ success: number; skipped: number; failed: number }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const sb = createClient(supabaseUrl, supabaseKey);
  const scraper = new StealthScraper();

  console.log("[dogo-scraper] Discovering articles from category pages...");
  const discoveredArticles = await discoverDogoArticles(scraper);
  const articles = discoveredArticles.slice(0, args.limit);

  console.log(`[dogo-scraper] Starting scrape (${articles.length} articles, concurrency=3)...`);

  // Pre-check existence for all articles (lightweight, serial is fine)
  const existingUrls = new Set<string>();
  for (const article of articles) {
    const { data: existing } = await sb
      .from("reading_topics")
      .select("source_url")
      .eq("source_url", article.url)
      .maybeSingle();
    if (existing) existingUrls.add(article.url);
  }

  let success = 0;
  let skipped = 0;
  let failed = 0;

  // Dry-run skip counting
  for (const article of articles) {
    const slug = article.url.split("/").pop() || "";
    const topicKey = "dogo-" + slug.replace(/-/g, "_");

    if (existingUrls.has(article.url)) {
      console.log(`SKIP (exists): ${article.url}`);
      skipped++;
      continue;
    }

    if (args.dryRun) {
      console.log(`[DRY-RUN] Would add: ${topicKey} (${article.category})`);
      skipped++;
      continue;
    }
  }

  // Only non-dry-run, non-existing articles go to parallel fetch
  const toFetch = articles.filter(
    (a) => !existingUrls.has(a.url) && !args.dryRun
  );

  await runInBatches(toFetch, 3, async (article) => {
    const slug = article.url.split("/").pop() || "";
    const topicKey = "dogo-" + slug.replace(/-/g, "_");

    console.log(`Fetching: ${article.url}`);

    // Fetch article HTML
    let sourceText = "";
    let pageHtml = "";
    try {
      const result = await scraper.scrape(article.url, { timeoutMs: 30000 });
      pageHtml = result.text; // StealthScraper returns text; we need raw HTML for extraction
      // Re-fetch raw HTML for structured extraction (StealthScraper may not expose raw HTML)
      // Fallback: use fetch for raw HTML, scraper for JS-rendered fallback
    } catch (err) {
      console.log(`  Stealth fetch failed: ${(err as Error).message}`);
    }

    // Try raw HTML fetch for better extraction
    try {
      const rawRes = await fetch(article.url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          Accept: "text/html",
        },
        signal: AbortSignal.timeout(15000),
      });
      pageHtml = await rawRes.text();
    } catch (err) {
      console.log(`  Raw fetch failed: ${(err as Error).message}`);
    }

    if (pageHtml) {
      const extracted = extractBody(pageHtml);
      sourceText = extracted.text;
      console.log(`  Extracted (${extracted.strategy}): ${sourceText.length} chars`);
    }

    // Extract cover image from page HTML (best-effort)
    let source_image_url: string | null = null;
    let source_inline_image_urls: string[] | null = null;
    try {
      const images = extractImages(pageHtml);
      source_image_url = images.cover;
      source_inline_image_urls = images.inline;
    } catch {
      // best-effort — leave null
    }

    const completeness = contentCompleteness(sourceText);

    // Insert
    const { error } = await sb.from("reading_topics").insert({
      topic_key: topicKey,
      language: "en",
      category: article.category,
      source: "dogo",
      source_url: article.url,
      source_text: sourceText || null,
      source_image_url,
      source_inline_image_urls,
      content_completeness: completeness,
      status: "active",
      target_grades: [3, 6],
    });

    if (error) {
      console.log(`  Insert failed: ${error.message}`);
      failed++;
    } else {
      console.log(`  Added: ${topicKey} (${completeness})`);
      success++;
    }
  });

  await scraper.close();

  console.log(`\n[dogo-scraper] Done: ${success} added, ${skipped} skipped, ${failed} failed`);
  return { success, skipped, failed };
}

// ---------------------------------------------------------------------------
// Export for CLI or programmatic use
// ---------------------------------------------------------------------------

export async function scrape(options?: { dryRun?: boolean; limit?: number }): Promise<{ success: number; skipped: number; failed: number }> {
  return scrapeDogoArticles({
    dryRun: options?.dryRun ?? false,
    limit: options?.limit ?? 50,
  });
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

const isEntryPoint = process.argv[1]?.includes("dogo-scraper");
if (isEntryPoint) {
  const args = parseArgs();
  scrapeDogoArticles(args).catch(console.error);
}
