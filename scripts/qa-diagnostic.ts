#!/usr/bin/env tsx
// Diagnostic: check actual DB schema and a few real articles
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // 1. Get all columns of reading_articles via information_schema
  console.log("=== reading_articles columns ===");
  const { data: cols, error: colErr } = await sb
    .from("information_schema.columns")
    .select("column_name, data_type, is_nullable, column_default")
    .eq("table_name", "reading_articles")
    .order("ordinal_position", { ascending: true });

  if (cols) {
    for (const c of cols) {
      console.log(`  ${c.column_name} (${c.data_type}) nullable=${c.is_nullable} default=${c.column_default}`);
    }
  } else {
    console.log("Error fetching columns:", colErr?.message);
    // Try alternative approach
    const { data: raw } = await sb
      .from("reading_articles")
      .select("*")
      .limit(1);
    if (raw && raw.length > 0) {
      console.log("Columns from first row:", Object.keys(raw[0]).sort().join(", "));
    }
  }

  // 2. All reading_topics columns
  console.log("\n=== reading_topics columns ===");
  const { data: cols2 } = await sb
    .from("information_schema.columns")
    .select("column_name, data_type")
    .eq("table_name", "reading_topics")
    .order("ordinal_position", { ascending: true });

  if (cols2) {
    for (const c of cols2) {
      console.log(`  ${c.column_name} (${c.data_type})`);
    }
  }

  // 3. Sample articles with content (non-empty)
  console.log("\n=== Sample published articles with content ===");
  const { data: samples } = await sb
    .from("reading_articles")
    .select("id, topic_key, title, status, genre, author_purpose, cultural_connection, content, word_count, source")
    .eq("status", "published")
    .limit(5);

  if (samples) {
    for (const a of samples) {
      console.log(`\n  topic_key: ${a.topic_key}`);
      console.log(`  title: ${a.title}`);
      console.log(`  source: ${a.source}`);
      console.log(`  word_count: ${a.word_count}`);
      console.log(`  genre: |${a.genre}|`);
      console.log(`  author_purpose: |${a.author_purpose}|`);
      console.log(`  cultural_connection: |${a.cultural_connection}|`);
      console.log(`  content length: ${(a.content || "").length}`);
      console.log(`  content preview: ${(a.content || "").slice(0, 100)}...`);
    }
  }

  // 4. Check how many have non-empty content in published articles
  console.log("\n=== Published articles content stats ===");
  const { data: published } = await sb
    .from("reading_articles")
    .select("id, content, word_count")
    .eq("status", "published")
    .limit(300);

  if (published) {
    const withContent = published.filter((a: any) => a.content && (a.content as string).length > 50).length;
    const empty = published.filter((a: any) => !a.content || (a.content as string).length === 0).length;
    const thin = published.filter((a: any) => a.content && (a.content as string).length > 0 && (a.content as string).length <= 50).length;
    console.log(`Total published: ${published.length}`);
    console.log(`With content (>50 chars): ${withContent}`);
    console.log(`Empty: ${empty}`);
    console.log(`Thin (1-50 chars): ${thin}`);

    // word_count vs actual content
    const mismatched = published.filter((a: any) => {
      const wc = a.word_count || 0;
      const actualLen = (a.content || "").length;
      return (wc === 0 && actualLen > 50) || (wc > 0 && actualLen === 0);
    });
    console.log(`Word count / content mismatch: ${mismatched.length}`);
  }
}

main().catch(console.error);