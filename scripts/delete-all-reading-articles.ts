#!/usr/bin/env node
/**
 * Delete all reading articles and cascaded data.
 * Uses ON DELETE CASCADE on reading_questions, reading_article_illustrations,
 * reading_assignments, reading_quiz_attempts.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const sb = createClient(url, key);

  console.log("Deleting all reading articles (cascade to questions, illustrations, assignments, quiz_attempts)...");
  const { error } = await sb.from("reading_articles").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) {
    console.error("Delete failed:", error.message);
    process.exit(1);
  }

  console.log("Done. All reading articles deleted.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
