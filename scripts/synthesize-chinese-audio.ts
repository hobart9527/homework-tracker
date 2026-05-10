#!/usr/bin/env node
/**
 * Synthesize audio for published Chinese reading articles.
 * Cron-compatible. Honors AZURE_SPEECH_KEY env (skips cleanly when absent).
 *
 * Usage:
 *   npx tsx scripts/synthesize-chinese-audio.ts --dry-run
 *   npx tsx scripts/synthesize-chinese-audio.ts --execute
 *
 * Env:
 *   AZURE_SPEECH_KEY        required for --execute (when absent, script logs and exits 0)
 *   AZURE_SPEECH_REGION     default eastus
 *   AUDIO_DEFAULT_VOICE     default zh-CN-XiaoxiaoNeural
 *   AUDIO_PIPELINE_LIMIT    default 0 (no limit)
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  required
 *
 * Exit codes:
 *   0 — completed (including no-key skip)
 *   1 — fatal env or DB error
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  synthesizeChinese,
  isTtsConfigured,
  MissingTtsKeyError,
} from "@/lib/reading/tts-azure-client";
import { uploadChineseAudio } from "@/lib/reading/audio-uploader";
import { createServiceRoleClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// TODO: remove this local interface after `npm run supabase:generate-types` is
// run against migration 039 (audio_zh_url / audio_zh_voice columns). Until
// then, the generated Database types do not yet expose these columns, so we
// cast at the query boundary.
interface Article {
  id: string;
  title: string;
  content: string;
  language: string;
  audio_zh_url: string | null;
  audio_zh_voice: string | null;
}

interface RunOptions {
  dryRun: boolean;
  execute: boolean;
}

interface RunSummary {
  total: number;
  synthesized: number;
  skipped: number;
  failed: number;
}

const DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural";
const DEFAULT_SPEAKING_RATE_PERCENT = -15;
const RATE_LIMIT_MS = 1500;
const MAX_CHARS = 4000;

// ---------------------------------------------------------------------------
// CLI parsing (no new npm dep)
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): RunOptions {
  const flags = new Set(argv.slice(2));
  const execute = flags.has("--execute");
  const dryRun = flags.has("--dry-run") || !execute; // default to dry-run
  return { dryRun: dryRun && !execute, execute };
}

// ---------------------------------------------------------------------------
// Environment validation
// ---------------------------------------------------------------------------

function validateEnv(): void {
  const required = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
    console.error(
      "Ensure these are set in .env.local or in the cron job environment."
    );
    const err = new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    ) as Error & { code: string };
    err.code = "ERR_MISSING_ENV";
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getVoice(): string {
  const v = process.env.AUDIO_DEFAULT_VOICE?.trim();
  return v && v.length > 0 ? v : DEFAULT_VOICE;
}

function getLimit(): number {
  const raw = process.env.AUDIO_PIPELINE_LIMIT;
  if (!raw) return 0;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) return 0;
  return n;
}

function estimateDurationSeconds(charCount: number): number {
  // Mirrors tts-azure-client heuristic: ~4 chars/sec at -15% rate, floor at 1.
  const raw = Math.ceil(charCount / 4);
  return raw > 0 ? raw : 1;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Candidate query
// ---------------------------------------------------------------------------

async function loadCandidates(
  supabase: SupabaseClient,
  limit: number
): Promise<Article[]> {
  let query = supabase
    .from("reading_articles")
    .select("id, title, content, language, audio_zh_url, audio_zh_voice")
    .eq("language", "zh")
    .eq("status", "published")
    .is("audio_zh_url", null);

  if (limit > 0) {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    // If the columns are missing, Supabase returns a 42703-like error referencing the column.
    const msg = error.message || "";
    if (
      msg.includes("audio_zh_url") ||
      msg.includes("audio_zh_voice") ||
      msg.includes("does not exist")
    ) {
      throw new Error(
        `reading_articles missing audio_zh_url / audio_zh_voice columns — migration 039 required. (${msg})`
      );
    }
    throw new Error(`Failed to load candidate articles: ${msg}`);
  }

  // Cast at the query boundary because the generated Database types do not
  // yet include audio_zh_url / audio_zh_voice (see TODO at top).
  return (data ?? []) as unknown as Article[];
}

// ---------------------------------------------------------------------------
// Per-article pipeline
// ---------------------------------------------------------------------------

async function processArticle(
  supabase: SupabaseClient,
  article: Article,
  voice: string,
  summary: RunSummary
): Promise<void> {
  const content = article.content ?? "";
  const trimmed = content.trim();

  if (trimmed.length === 0) {
    console.log(`[skip empty] ${article.id}`);
    summary.skipped++;
    return;
  }

  if (content.length > MAX_CHARS) {
    console.log(
      `[skip too-long] ${article.id} (${content.length} chars > ${MAX_CHARS})`
    );
    summary.skipped++;
    return;
  }

  try {
    const tts = await synthesizeChinese({
      text: content,
      speakingRatePercent: DEFAULT_SPEAKING_RATE_PERCENT,
      voice,
    });

    const upload = await uploadChineseAudio(supabase, {
      articleId: article.id,
      audioBytes: tts.audioBytes,
      voice: tts.voice,
      durationSecondsEstimate: tts.durationSecondsEstimate,
    });

    const { error: updateError } = await supabase
      .from("reading_articles")
      .update({
        audio_zh_url: upload.publicUrl,
        audio_zh_voice: upload.voice,
      } as never)
      .eq("id", article.id);

    if (updateError) {
      throw new Error(`DB update failed: ${updateError.message}`);
    }

    console.log(
      `[ok] ${article.id} ${article.title} → ${upload.publicUrl} (~${upload.durationSecondsEstimate}s)`
    );
    summary.synthesized++;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`[fail] ${article.id} — ${message}`);
    summary.failed++;
  }
}

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

async function runDryRun(supabase: SupabaseClient, limit: number): Promise<void> {
  const candidates = await loadCandidates(supabase, limit);
  console.log(`Candidates: ${candidates.length}`);
  if (candidates.length === 0) {
    console.log("(no published Chinese articles missing audio_zh_url)");
    return;
  }
  console.log("");
  for (const a of candidates) {
    const charCount = (a.content ?? "").length;
    const estSec = estimateDurationSeconds(charCount);
    console.log(
      `  - ${a.id}  "${a.title}"  ${charCount} chars  ~${estSec}s`
    );
  }
  console.log("");
  console.log("(dry-run: no API calls, no DB writes)");
}

async function runExecute(
  supabase: SupabaseClient,
  voice: string,
  limit: number
): Promise<RunSummary> {
  const summary: RunSummary = {
    total: 0,
    synthesized: 0,
    skipped: 0,
    failed: 0,
  };

  if (!isTtsConfigured()) {
    console.log("no AZURE_SPEECH_KEY configured, skipping all synthesis");
    return summary;
  }

  const candidates = await loadCandidates(supabase, limit);
  summary.total = candidates.length;
  console.log(`Candidates: ${candidates.length}`);
  console.log(`Voice:      ${voice}`);
  console.log(`Rate limit: ${RATE_LIMIT_MS}ms between articles`);
  console.log("");

  for (let i = 0; i < candidates.length; i++) {
    const article = candidates[i];
    process.stdout.write(`[${i + 1}/${candidates.length}] `);
    try {
      await processArticle(supabase, article, voice, summary);
    } catch (err) {
      // processArticle handles its own errors; this is a defensive net so a
      // bug there cannot abort the batch.
      const message = err instanceof Error ? err.message : String(err);
      // If synthesize threw MissingTtsKeyError mid-batch (e.g. key removed),
      // it would bubble here — but isTtsConfigured() check above already
      // short-circuited the no-key path. Any MissingTtsKeyError reaching
      // here is logged like any other per-article failure, NOT fatal.
      if (err instanceof MissingTtsKeyError) {
        console.log(`[fail] ${article.id} — ${message}`);
      } else {
        console.log(`[fail] ${article.id} — ${message}`);
      }
      summary.failed++;
    }

    if (i < candidates.length - 1) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  return summary;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const opts = parseArgs(process.argv);

  console.log("=== Synthesize Chinese Audio ===");
  console.log(`Mode:       ${opts.execute ? "execute" : "dry-run"}`);

  validateEnv();

  const voice = getVoice();
  const limit = getLimit();

  console.log(
    `Limit:      ${limit > 0 ? limit : "no limit"} (AUDIO_PIPELINE_LIMIT)`
  );
  console.log("");

  const supabase = await createServiceRoleClient();

  if (opts.execute) {
    const summary = await runExecute(supabase, voice, limit);
    console.log("");
    console.log("=== SUMMARY ===");
    console.log(`Total:        ${summary.total}`);
    console.log(`Synthesized:  ${summary.synthesized}`);
    console.log(`Skipped:      ${summary.skipped}`);
    console.log(`Failed:       ${summary.failed}`);
  } else {
    await runDryRun(supabase, limit);
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("\nFatal error:", message);
  if ((err as Error & { code?: string }).code === "ERR_MISSING_ENV") {
    console.error(
      "(Expected when environment is not configured — this is not a code error.)"
    );
  }
  process.exit(1);
});
