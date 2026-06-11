/**
 * Scrape All Sources
 *
 * Orchestrates running all configured scrapers via CLI commands.
 * This module is called by reading-content-pipeline.ts when --scrape-first is enabled.
 *
 * Usage:
 *   npx tsx scripts/reading/scrape-all-sources.ts [--dry-run] [--lang en|zh]
 */

import { spawn } from "child_process";
import { config } from "dotenv";

config({ path: ".env.local" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScrapeResult {
  source: string;
  success: boolean;
  recordsProcessed: number;
  error?: string;
}

interface ScrapeOptions {
  dryRun: boolean;
  lang: "zh" | "en";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function runScraper(args: string[]): Promise<{ success: boolean; output: string; error?: string }> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";

    const proc = spawn("npx", ["tsx", ...args], {
      cwd: process.cwd(),
      env: { ...process.env },
    });

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve({ success: true, output: stdout });
      } else {
        resolve({ success: false, output: stdout, error: stderr });
      }
    });

    proc.on("error", (err) => {
      resolve({ success: false, output: "", error: err.message });
    });

    // Timeout: 5 minutes per scraper
    setTimeout(() => {
      proc.kill();
      resolve({ success: false, output: stdout, error: "Timeout after 5 minutes" });
    }, 300000);
  });
}

function parseCount(output: string): number {
  // Try to parse insert counts from Supabase or scraper output
  // Common formats: "inserted: N", "N rows inserted", "N added", "Done: X added"
  const match = output.match(/(\d+)\s*(rows?\s*)?(inserted|upserted|processed|added)/i);
  return match ? parseInt(match[1], 10) : 0;
}

function printSummary(results: ScrapeResult[], totalTime: number): void {
  console.log("\n" + "=".repeat(60));
  console.log("SCRAPE SUMMARY");
  console.log("=".repeat(60));

  let totalRecords = 0;
  for (const r of results) {
    const status = r.success ? "✅" : "❌";
    console.log(`${status} ${r.source}: ${r.recordsProcessed} records${r.error ? ` (${r.error})` : ""}`);
    totalRecords += r.recordsProcessed;
  }

  console.log("-".repeat(60));
  console.log(`Total: ${totalRecords} records in ${(totalTime / 1000).toFixed(1)}s`);
  console.log("=".repeat(60) + "\n");
}

// ---------------------------------------------------------------------------
// Main scrape function (exported)
// ---------------------------------------------------------------------------

export async function scrapeAllSources(options: ScrapeOptions = { dryRun: false, lang: "en" }): Promise<ScrapeResult[]> {
  const startTime = Date.now();

  console.log("[scrape-all-sources] Starting scrape of all sources...");

  // Run all scrapers in parallel
  const scraperJobs = [
    { source: "icdl", args: ["scripts/reading/scrapers/icdl-scraper.ts", "--lang", options.lang, "--limit", "50", ...(options.dryRun ? ["--dry-run"] : [])] },
    { source: "dogo", args: ["scripts/reading/scrapers/dogo-scraper.ts", "--limit", "20", ...(options.dryRun ? ["--dry-run"] : [])] },
    { source: "bbc-newsround", args: ["scripts/reading/scrapers/bbc-newsround-scraper.ts", "--limit", "20", ...(options.dryRun ? ["--dry-run"] : [])] },
    // English-language scrapers
    ...(options.lang === "en" ? [
      { source: "commonlit", args: ["scripts/reading/scrapers/commonlit-scraper.ts", "--limit", "10", ...(options.dryRun ? ["--dry-run"] : [])] },
      { source: "news-in-levels", args: ["scripts/reading/scrapers/news-in-levels.ts", ...(options.dryRun ? ["--dry-run"] : [])] },
    ] : []),
    // Chinese-language scraper
    ...(options.lang === "zh" ? [
      { source: "gushiwen", args: ["scripts/reading/scrapers/gushiwen-scraper.ts", "--limit", "15", ...(options.dryRun ? ["--dry-run"] : [])] },
    ] : []),
  ];

  const jobPromises = scraperJobs.map(async (job) => {
    console.log(`[scrape-all-sources] Starting ${job.source}...`);
    try {
      const result = await runScraper(job.args);
      console.log(`[scrape-all-sources] ${job.source} ${result.success ? "done" : "failed"}`);
      return {
        source: job.source,
        success: result.success,
        recordsProcessed: parseCount(result.output),
        error: result.error,
      } as ScrapeResult;
    } catch (e) {
      return { source: job.source, success: false, recordsProcessed: 0, error: String(e) } as ScrapeResult;
    }
  });

  const results = await Promise.all(jobPromises);

  const totalTime = Date.now() - startTime;
  printSummary(results, totalTime);

  return results;
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const langArg = args.find((a) => a.startsWith("--lang="));
  const lang = (langArg ? langArg.split("=")[1] : "en") as "zh" | "en";

  await scrapeAllSources({ dryRun, lang });
}

// ESM-compatible entry point check (avoid CJS require.main in ESM context)
const isEntryPoint = process.argv[1]?.includes("scrape-all-sources");
if (isEntryPoint) {
  main().catch(console.error);
}

export default scrapeAllSources;
