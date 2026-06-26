/**
 * One-time script: prune articles to target 40/grade for English.
 * Archiving oldest surplus articles beyond the cap.
 *
 * Usage: npx tsx scripts/prune-existing-articles.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createServiceRoleClient } from "@/lib/supabase/server";

const TARGET_PER_GRADE = 40;

async function main() {
  const supabase = await createServiceRoleClient();

  for (let grade = 3; grade <= 10; grade++) {
    const { data: articles } = await supabase
      .from("reading_articles")
      .select("id, topic_key, created_at, word_count, status")
      .eq("language", "en")
      .eq("status", "published")
      .eq("grade_level", grade)
      .order("word_count", { ascending: false }); // keep longer (higher quality) articles

    if (!articles) continue;
    console.log(`G${grade}: ${articles.length} published`);

    if (articles.length <= TARGET_PER_GRADE) continue;

    // Keep the top TARGET_PER_GRADE by word_count, archive the rest
    const toArchive = articles.slice(TARGET_PER_GRADE);
    const ids = toArchive.map(a => a.id);

    // Log what we're archiving
    toArchive.forEach(a => {
      console.log(`  → archive: ${a.topic_key} (${a.word_count}w, ${a.created_at?.slice(0,10)})`);
    });

    const { error } = await supabase
      .from("reading_articles")
      .update({ status: "archived" })
      .in("id", ids);

    if (error) {
      console.error(`  Error archiving G${grade}: ${error.message}`);
    } else {
      console.log(`  Archived ${ids.length} articles for G${grade}`);
    }
  }
}

main().catch(console.error);
