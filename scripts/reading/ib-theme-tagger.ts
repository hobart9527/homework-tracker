#!/usr/bin/env npx tsx

/**
 * IB Theme Tagger
 *
 * Reads unannotated reading_topics from Supabase, calls LLM (OpenAI) to analyze
 * each topic's source_text, and outputs { topic_key, ib_theme_code, text_type, confidence }.
 * Results are written back to the reading_topics table.
 *
 * Usage:
 *   npx tsx scripts/reading/ib-theme-tagger.ts --dry-run
 *   npx tsx scripts/reading/ib-theme-tagger.ts --execute
 *
 * Environment:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   OPENAI_API_KEY
 *   OPENAI_BASE_URL         (optional, defaults to https://api.openai.com/v1)
 *   OPENAI_READING_MODEL    (optional, defaults to gpt-4o-mini)
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

config({ path: ".env.local" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TopicRow {
  topic_key: string;
  source_text: string | null;
  title: string | null;
  category: string | null;
  language: "zh" | "en" | null;
  ib_theme_code: string | null;
  text_type: string | null;
}

interface TagResult {
  topic_key: string;
  ib_theme_code: string;
  text_type: string;
  confidence: number; // 0.0–1.0
  reasoning: string;
}

// ---------------------------------------------------------------------------
// Zod schema for LLM structured output
// ---------------------------------------------------------------------------

const TagOutputSchema = z.object({
  ib_theme_code: z.enum(["T1", "T2", "T3", "T4", "T5", "T6"]),
  text_type: z.enum(["fiction", "non-fiction", "poetry", "drama", "media", "academic"]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(200),
});

// ---------------------------------------------------------------------------
// IB Theme descriptions for prompt context
// ---------------------------------------------------------------------------

const IB_THEME_CONTEXT = `
IB Themes (choose the single best match):
- T1 "Who we are": Identity, relationships, well-being, personal growth, family, friendship, self-discovery.
- T2 "Where we are in place and time": History, civilization, geography, exploration, historical events, ancient cultures.
- T3 "How we express ourselves": Arts, literature, media, creative expression, storytelling, poetry, music, visual arts.
- T4 "How the world works": Science, technology, nature, physics, biology, astronomy, inventions, natural phenomena.
- T5 "How we organize ourselves": Systems, governance, economics, politics, social structures, laws, organizations.
- T6 "Sharing the planet": Environment, sustainability, equity, conservation, climate, resource sharing, global issues.
`;

const TEXT_TYPE_CONTEXT = `
Text Types (choose the single best match):
- fiction: Narrative, realistic, fantasy, fairy tales, fables, stories with characters and plot.
- non-fiction: Informational, expository, factual articles, biographies, essays.
- poetry: Verse, rhyme, free verse, poems, lyrical text.
- drama: Script, dialogue, performance text, plays.
- media: News article, blog post, advertisement, editorial.
- academic: Research paper, literary analysis, scholarly essay.
`;

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

interface CliArgs {
  dryRun: boolean;
  execute: boolean;
  limit: number;
  batchSize: number;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const execute = args.includes("--execute");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : 0;
  const batchArg = args.find((a) => a.startsWith("--batch-size="));
  const batchSize = batchArg ? parseInt(batchArg.split("=")[1], 10) : 5;

  if (!dryRun && !execute) {
    console.error("Usage: npx tsx scripts/reading/ib-theme-tagger.ts --dry-run | --execute");
    console.error("  --dry-run     Show what would be tagged without writing to database");
    console.error("  --execute     Actually write tags to Supabase");
    console.error("  --limit=N     Process at most N topics (0 = all)");
    console.error("  --batch-size=N  LLM batch size (default 5)");
    process.exit(1);
  }

  return { dryRun, execute, limit, batchSize };
}

// ---------------------------------------------------------------------------
// Environment validation
// ---------------------------------------------------------------------------

function validateEnv(): { supabaseUrl: string; supabaseKey: string; openaiKey: string; openaiBaseUrl: string; openaiModel: string } {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const openaiBaseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const openaiModel = process.env.OPENAI_READING_MODEL || "gpt-4o-mini";

  const missing: string[] = [];
  if (!supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!supabaseKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!openaiKey) missing.push("OPENAI_API_KEY");

  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(", ")}`);
    process.exit(1);
  }

  return { supabaseUrl: supabaseUrl!, supabaseKey: supabaseKey!, openaiKey: openaiKey!, openaiBaseUrl, openaiModel };
}

// ---------------------------------------------------------------------------
// LLM call
// ---------------------------------------------------------------------------

async function callLLM(
  topics: TopicRow[],
  env: ReturnType<typeof validateEnv>
): Promise<TagResult[]> {
  const systemPrompt = `You are an IB (International Baccalaureate) curriculum expert. Your task is to classify reading topics into IB transdisciplinary themes and text types.

${IB_THEME_CONTEXT}
${TEXT_TYPE_CONTEXT}

Respond with a JSON array where each element corresponds to the input topic in order. Each element must strictly follow this schema:
{
  "ib_theme_code": "T1" | "T2" | "T3" | "T4" | "T5" | "T6",
  "text_type": "fiction" | "non-fiction" | "poetry" | "drama" | "media" | "academic",
  "confidence": number between 0 and 1,
  "reasoning": "brief explanation in 1 sentence"
}`;

  const userContent = topics
    .map(
      (t, i) =>
        `[${i}] topic_key=${t.topic_key}\ntitle=${t.title || ""}\ncategory=${t.category || ""}\nlanguage=${t.language || ""}\nsource_text=${(t.source_text || "").slice(0, 800)}`
    )
    .join("\n\n---\n\n");

  const response = await fetch(`${env.openaiBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.openaiKey}`,
    },
    body: JSON.stringify({
      model: env.openaiModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 2048,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${text}`);
  }

  const json = await response.json();
  const rawContent = json.choices?.[0]?.message?.content;
  if (!rawContent) {
    throw new Error("Empty response from LLM");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    throw new Error(`Invalid JSON from LLM: ${rawContent.slice(0, 200)}`);
  }

  // The LLM may return { results: [...] } or directly an array
  let items: unknown[];
  if (Array.isArray(parsed)) {
    items = parsed;
  } else if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.results)) {
      items = obj.results;
    } else if (Array.isArray(obj.classifications)) {
      items = obj.classifications;
    } else {
      items = Object.values(obj);
    }
  } else {
    items = [];
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error(`Unexpected LLM response shape: ${JSON.stringify(parsed).slice(0, 200)}`);
  }

  const results: TagResult[] = [];
  for (let i = 0; i < topics.length; i++) {
    const item = items[i];
    const parsedItem = TagOutputSchema.safeParse(item);
    if (!parsedItem.success) {
      console.warn(`  [${topics[i].topic_key}] LLM output validation failed: ${parsedItem.error.message}`);
      results.push({
        topic_key: topics[i].topic_key,
        ib_theme_code: "T1",
        text_type: "non-fiction",
        confidence: 0.0,
        reasoning: "Fallback due to LLM validation failure",
      });
      continue;
    }
    results.push({
      topic_key: topics[i].topic_key,
      ib_theme_code: parsedItem.data.ib_theme_code,
      text_type: parsedItem.data.text_type,
      confidence: parsedItem.data.confidence,
      reasoning: parsedItem.data.reasoning,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = any;

async function fetchUnannotatedTopics(
  sb: AnySupabaseClient,
  limit: number
): Promise<TopicRow[]> {
  let query = sb
    .from("reading_topics")
    .select("topic_key, source_text, title, category, language, ib_theme_code, text_type")
    .or("ib_theme_code.is.null,text_type.is.null");

  if (limit > 0) {
    query = query.limit(limit);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to fetch topics: ${error.message}`);
  }
  return (data || []) as TopicRow[];
}

async function writeTags(
  sb: AnySupabaseClient,
  results: TagResult[],
  dryRun: boolean
): Promise<{ updated: number; failed: number }> {
  if (dryRun) {
    console.log("\n=== DRY RUN — no database changes ===\n");
    for (const r of results) {
      console.log(`[DRY] ${r.topic_key}: ib_theme_code=${r.ib_theme_code}, text_type=${r.text_type}, confidence=${r.confidence.toFixed(2)}`);
      console.log(`      reasoning: ${r.reasoning}`);
    }
    return { updated: 0, failed: 0 };
  }

  let updated = 0;
  let failed = 0;

  for (const r of results) {
    const { error } = await sb
      .from("reading_topics")
      .update({
        ib_theme_code: r.ib_theme_code,
        text_type: r.text_type,
      })
      .eq("topic_key", r.topic_key);

    if (error) {
      console.error(`  Update failed for ${r.topic_key}: ${error.message}`);
      failed++;
    } else {
      updated++;
    }
  }

  return { updated, failed };
}

// ---------------------------------------------------------------------------
// Batch helper
// ---------------------------------------------------------------------------

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs();
  const env = validateEnv();

  console.log("=== IB Theme Tagger ===\n");
  console.log(`Mode:       ${args.dryRun ? "DRY-RUN" : "EXECUTE"}`);
  console.log(`Limit:      ${args.limit > 0 ? args.limit : "unlimited"}`);
  console.log(`Batch size: ${args.batchSize}`);
  console.log(`Model:      ${env.openaiModel}\n`);

  const sb = createClient(env.supabaseUrl, env.supabaseKey);

  // 1. Fetch unannotated topics
  console.log("Fetching unannotated topics...");
  const topics = await fetchUnannotatedTopics(sb, args.limit);
  console.log(`Found ${topics.length} topics to tag.\n`);

  if (topics.length === 0) {
    console.log("No unannotated topics found. Exiting.");
    return;
  }

  // 2. Process in batches
  const allResults: TagResult[] = [];
  const batches = chunkArray(topics, args.batchSize);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`[Batch ${i + 1}/${batches.length}] Tagging ${batch.length} topics...`);

    try {
      const results = await callLLM(batch, env);
      allResults.push(...results);

      for (const r of results) {
        console.log(`  ${r.topic_key}: ${r.ib_theme_code} / ${r.text_type} (confidence: ${r.confidence.toFixed(2)})`);
      }
    } catch (err) {
      console.error(`  Batch ${i + 1} failed: ${(err as Error).message}`);
      // Fallback: mark all as unclassified
      for (const t of batch) {
        allResults.push({
          topic_key: t.topic_key,
          ib_theme_code: "T1",
          text_type: "non-fiction",
          confidence: 0.0,
          reasoning: "Fallback due to batch LLM failure",
        });
      }
    }

    // Rate limit between batches
    if (i < batches.length - 1) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // 3. Write results
  console.log("\nWriting results to database...");
  const { updated, failed } = await writeTags(sb, allResults, args.dryRun);

  // 4. Summary
  const highConfidence = allResults.filter((r) => r.confidence >= 0.8).length;
  const mediumConfidence = allResults.filter((r) => r.confidence >= 0.5 && r.confidence < 0.8).length;
  const lowConfidence = allResults.filter((r) => r.confidence < 0.5).length;

  console.log("\n=== SUMMARY ===");
  console.log(`Total processed: ${allResults.length}`);
  console.log(`High confidence (>=0.8): ${highConfidence}`);
  console.log(`Medium confidence (0.5-0.8): ${mediumConfidence}`);
  console.log(`Low confidence (<0.5): ${lowConfidence}`);
  if (!args.dryRun) {
    console.log(`Updated: ${updated}`);
    console.log(`Failed: ${failed}`);
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("\nFatal error:", message);
  process.exit(1);
});
