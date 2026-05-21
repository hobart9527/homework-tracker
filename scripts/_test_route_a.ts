import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: topics } = await sb.from("reading_topics").select("topic_key, source_text").eq("source", "dogo").eq("status", "active").not("source_text", "is", null).limit(5);
  if (!topics || topics.length === 0) { console.log("No dogo topics with source_text"); return; }
  const keys = topics.map(t => t.topic_key);
  // check which have a G4 article (since most already have G3 and G6)
  const { data: existing } = await sb.from("reading_articles").select("topic_key").in("topic_key", keys).eq("grade_level", 6);
  const existingKeys = new Set(existing?.map(e => e.topic_key) || []);
  for (const t of topics) {
    console.log(`${t.topic_key}: source_text=${t.source_text?.length || 0} chars, has_G6=${existingKeys.has(t.topic_key)}`);
  }
  // Also check: can we regenerate a G4 to test Route A? Grade 4 in expanded range
  const { data: allDogo } = await sb.from("reading_articles").select("topic_key, grade_level").in("topic_key", keys);
  console.log("\nAll dogo articles:", allDogo?.map(a => `${a.topic_key}:G${a.grade_level}`));
}
main().catch(console.error);
