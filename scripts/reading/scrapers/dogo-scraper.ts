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
  let success = 0;
  let skipped = 0;
  let failed = 0;

  console.log(`[dogo-scraper] Starting scrape (${articles.length} articles)...`);

  for (const article of articles) {
    // Derive topic_key from URL slug
    const slug = article.url.split("/").pop() || "";
    const topicKey = "dogo-" + slug.replace(/-/g, "_");

    // Check if already exists
    const { data: existing } = await sb
      .from("reading_topics")
      .select("topic_key")
      .eq("source_url", article.url)
      .maybeSingle();

    if (existing) {
      console.log(`SKIP (exists): ${article.url}`);
      skipped++;
      continue;
    }

    if (args.dryRun) {
      console.log(`[DRY-RUN] Would add: ${topicKey} (${article.category})`);
      skipped++;
      continue;
    }

    // Fetch article to extract source_text
    console.log(`Fetching: ${article.url}`);
    let sourceText = "";
    try {
      const result = await scraper.scrape(article.url, { timeoutMs: 30000 });
      sourceText = result.text;
      console.log(`  Got ${sourceText.length} chars`);
    } catch (err) {
      console.log(`  Fetch failed: ${(err as Error).message}`);
    }

    // Extract cover image from page HTML (best-effort)
    let source_image_url: string | null = null;
    try {
      const pageHtml = await fetch(article.url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          Accept: "text/html",
        },
        signal: AbortSignal.timeout(15000),
      }).then((r) => r.text());
      const images = extractImages(pageHtml);
      source_image_url = images.cover;
    } catch {
      // best-effort — leave null
    }

    // Insert
    const { error } = await sb.from("reading_topics").insert({
      topic_key: topicKey,
      language: "en",
      category: article.category,
      source: "dogo",
      source_url: article.url,
      source_text: sourceText || null,
      source_image_url,
      status: "active",
      target_grades: [3, 6],
    });

    if (error) {
      console.log(`  Insert failed: ${error.message}`);
      failed++;
    } else {
      console.log(`  Added: ${topicKey}`);
      success++;
    }

    // Rate limit
    await new Promise((r) => setTimeout(r, 2000));
  }

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
