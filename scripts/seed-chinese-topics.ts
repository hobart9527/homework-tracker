#!/usr/bin/env tsx
/**
 * Seed 20 Chinese reading topics (成语/寓言/历史) into reading_topics.
 *
 * Step 1 of homework-tracker Chinese reading content production.
 *
 * Usage:
 *   npx tsx scripts/seed-chinese-topics.ts
 *
 * Skip inserting a topic if topic_key already exists.
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface TopicSeed {
  topic_key: string;
  category: string;
}

const TOPICS: TopicSeed[] = [
  // ---- 成语故事 (7) ----
  { topic_key: "chengyu-huajia", category: "成语故事" },
  { topic_key: "chengyu-maodun", category: "成语故事" },
  { topic_key: "chengyu-wangyang", category: "成语故事" },
  { topic_key: "chengyu-saier", category: "成语故事" },
  { topic_key: "chengyu-jingwei", category: "成语故事" },
  { topic_key: "chengyu-buma", category: "成语故事" },
  { topic_key: "chengyu-zuoren", category: "成语故事" },
  // ---- 寓言故事 (7) ----
  { topic_key: "yuyan-yugong", category: "寓言故事" },
  { topic_key: "yuyan-danqin", category: "寓言故事" },
  { topic_key: "yuyan-jingwa", category: "寓言故事" },
  { topic_key: "yuyan-hujia", category: "寓言故事" },
  { topic_key: "yuyan-yaner", category: "寓言故事" },
  { topic_key: "yuyan-lanyu", category: "寓言故事" },
  { topic_key: "yuyan-maolu", category: "寓言故事" },
  // ---- 历史故事 (6) ----
  { topic_key: "lishi-sima", category: "历史故事" },
  { topic_key: "lishi-wuxin", category: "历史故事" },
  { topic_key: "lishi-mengmu", category: "历史故事" },
  { topic_key: "lishi-zhengxiang", category: "历史故事" },
  { topic_key: "lishi-sangu", category: "历史故事" },
  { topic_key: "lishi-weijiu", category: "历史故事" },
];

async function main() {
  let inserted = 0;
  let skipped = 0;

  for (const t of TOPICS) {
    // Check if already exists
    const { data: existing } = await sb
      .from("reading_topics")
      .select("topic_key")
      .eq("topic_key", t.topic_key)
      .maybeSingle();

    if (existing) {
      console.log(`SKIP (exists): ${t.topic_key}`);
      skipped++;
      continue;
    }

    const { error } = await sb.from("reading_topics").insert({
      topic_key: t.topic_key,
      language: "zh",
      category: t.category,
      status: "active",
      target_grades: [3, 4, 5, 6],
    });

    if (error) {
      console.error(`FAIL ${t.topic_key}: ${error.message}`);
    } else {
      console.log(`OK   ${t.topic_key} (${t.category})`);
      inserted++;
    }
  }

  console.log(`\nDone. Inserted: ${inserted}, Skipped: ${skipped}`);
}

main().catch(console.error);
