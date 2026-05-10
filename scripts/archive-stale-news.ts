#!/usr/bin/env node
/**
 * Archive stale news topics.
 * Cron-compatible. Marks reading_topics.status='archived' for category_v2='时事'
 * topics whose freshness_until has passed, and demotes their reading_articles
 * from 'published' to 'draft' so the recommendation pipeline excludes them.
 *
 * Usage:
 *   npx tsx scripts/archive-stale-news.ts --dry-run
 *   npx tsx scripts/archive-stale-news.ts --execute
 *
 * Env required:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Exit codes:
 *   0 — completed (even when 0 candidates)
 *   1 — fatal env or DB error
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Local row shape: category_v2 and freshness_until come from migration 038 but
// the generated Supabase Database types may not yet expose them. We cast at
// the query boundary via `as unknown as StaleTopicRow[]`.
interface StaleTopicRow {
  topic_key: string;
  language: string;
  freshness_until: string | null;
  status: string;
  category_v2: string | null;
}

interface RunOptions {
  dryRun: boolean;
  execute: boolean;
}

interface RunSummary {
  scanned: number;
  archived: number;
  demoted: number;
  failed: number;
}

const NEWS_CATEGORY = "时事";

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
// Candidate query
// ---------------------------------------------------------------------------

async function loadStaleTopics(
  supabase: SupabaseClient,
  nowIso: string
): Promise<StaleTopicRow[]> {
  const { data, error } = await supabase
    .from("reading_topics")
    .select("topic_key, language, freshness_until, status, category_v2")
    .eq("category_v2", NEWS_CATEGORY)
    .eq("status", "active")
    .not("freshness_until", "is", null)
    .lt("freshness_until", nowIso);

  if (error) {
    const msg = error.message || "";
    if (
      msg.includes("category_v2") ||
      msg.includes("freshness_until") ||
      msg.includes("does not exist")
    ) {
      throw new Error(
        `reading_topics missing category_v2 / freshness_until columns — migration 038 required. (${msg})`
      );
    }
    throw new Error(`Failed to load stale topics: ${msg}`);
  }

  // Cast at the query boundary because the generated Database types do not
  // yet include category_v2 / freshness_until (see comment at top).
  return (data ?? []) as unknown as StaleTopicRow[];
}

async function countPublishedArticles(
  supabase: SupabaseClient,
  topicKey: string
): Promise<number> {
  const { count, error } = await supabase
    .from("reading_articles")
    .select("id", { count: "exact", head: true })
    .eq("topic_key", topicKey)
    .eq("status", "published");

  if (error) {
    throw new Error(
      `Failed to count published articles for ${topicKey}: ${error.message}`
    );
  }
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

async function archiveTopic(
  supabase: SupabaseClient,
  topic: StaleTopicRow
): Promise<void> {
  const { error } = await supabase
    .from("reading_topics")
    .update({
      status: "archived",
      updated_at: new Date().toISOString(),
    } as never)
    .eq("topic_key", topic.topic_key)
    .eq("language", topic.language);

  if (error) {
    throw new Error(`UPDATE reading_topics failed: ${error.message}`);
  }
}

async function demoteArticles(
  supabase: SupabaseClient,
  topicKey: string
): Promise<number> {
  // Select first so we can return an accurate count of rows actually demoted.
  const { data: rows, error: selErr } = await supabase
    .from("reading_articles")
    .select("id")
    .eq("topic_key", topicKey)
    .eq("status", "published");

  if (selErr) {
    throw new Error(
      `SELECT reading_articles for ${topicKey} failed: ${selErr.message}`
    );
  }

  const ids = (rows ?? []).map((r: { id: string }) => r.id);
  if (ids.length === 0) {
    return 0;
  }

  const { error: updErr } = await supabase
    .from("reading_articles")
    .update({ status: "draft" } as never)
    .in("id", ids);

  if (updErr) {
    throw new Error(
      `UPDATE reading_articles for ${topicKey} failed: ${updErr.message}`
    );
  }

  return ids.length;
}

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

async function runDryRun(
  supabase: SupabaseClient,
  nowIso: string
): Promise<void> {
  const candidates = await loadStaleTopics(supabase, nowIso);

  console.log("=== Archive Stale News (dry-run) ===");
  console.log(`Now:              ${nowIso}`);
  console.log(`Candidate topics: ${candidates.length}`);

  let totalArticles = 0;

  for (const topic of candidates) {
    let articleCount = 0;
    try {
      articleCount = await countPublishedArticles(supabase, topic.topic_key);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(
        `  - ${topic.topic_key} (${topic.language}) freshness_until=${topic.freshness_until} articles=ERROR (${message})`
      );
      continue;
    }
    totalArticles += articleCount;
    console.log(
      `  - ${topic.topic_key} (${topic.language}) freshness_until=${topic.freshness_until} articles=${articleCount}`
    );
  }

  console.log(`Articles to demote: ${totalArticles}`);
  console.log("");
  console.log("(dry-run: no DB writes)");
}

async function runExecute(
  supabase: SupabaseClient,
  nowIso: string
): Promise<RunSummary> {
  const summary: RunSummary = {
    scanned: 0,
    archived: 0,
    demoted: 0,
    failed: 0,
  };

  const candidates = await loadStaleTopics(supabase, nowIso);
  summary.scanned = candidates.length;

  console.log("=== Archive Stale News (execute) ===");
  console.log(`Now:              ${nowIso}`);
  console.log(`Candidate topics: ${candidates.length}`);
  console.log("");

  for (const topic of candidates) {
    // Per-topic isolation: a single failure must not abort the batch.
    try {
      const demotedCount = await demoteArticles(supabase, topic.topic_key);
      console.log(
        `[demoted] ${topic.topic_key} articles=${demotedCount}`
      );
      summary.demoted += demotedCount;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`[fail] ${topic.topic_key} demote — ${message}`);
      summary.failed++;
      // Do not attempt archive if demotion failed; move on.
      continue;
    }

    try {
      await archiveTopic(supabase, topic);
      console.log(`[archived] ${topic.topic_key}`);
      summary.archived++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`[fail] ${topic.topic_key} archive — ${message}`);
      summary.failed++;
    }
  }

  return summary;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const opts = parseArgs(process.argv);
  const nowIso = new Date().toISOString();

  validateEnv();

  const supabase = await createServiceRoleClient();

  if (opts.execute) {
    const summary = await runExecute(supabase, nowIso);
    console.log("");
    console.log("=== SUMMARY ===");
    console.log(`Scanned:   ${summary.scanned}`);
    console.log(`Archived:  ${summary.archived} topic(s)`);
    console.log(`Demoted:   ${summary.demoted} article(s)`);
    console.log(`Failed:    ${summary.failed}`);
  } else {
    await runDryRun(supabase, nowIso);
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
