import { config } from "dotenv";
config({ path: ".env.local" });

import { createServiceRoleClient } from "@/lib/supabase/server";
import { convertToRubyPinyin } from "@/lib/reading/pinyin-converter";

const BATCH_SIZE = 50;

function containsChinese(text: string): boolean {
  return /[一-鿿]/.test(text);
}

async function main() {
  const supabase = await createServiceRoleClient();

  // Count total affected rows first
  const { count, error: countErr } = await supabase
    .from("reading_articles")
    .select("id", { count: "exact", head: true })
    .or("language.is.null,language.eq.");

  if (countErr) {
    console.error("Failed to count affected rows:", countErr.message);
    process.exit(1);
  }

  const total = count || 0;
  console.log(`Found ${total} articles with missing language.`);

  if (total === 0) {
    console.log("Nothing to fix. Exiting.");
    return;
  }

  let processed = 0;
  let fixedZh = 0;
  let fixedEn = 0;
  let pinyinGenerated = 0;
  let errors = 0;

  while (true) {
    const { data: rows, error: fetchErr } = await supabase
      .from("reading_articles")
      .select("id, content, pinyin_content")
      .or("language.is.null,language.eq.")
      .limit(BATCH_SIZE);

    if (fetchErr) {
      console.error("Fetch error:", fetchErr.message);
      process.exit(1);
    }

    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      try {
        const isChinese = containsChinese(row.content || "");
        const language = isChinese ? "zh" : "en";

        const update: {
          language: string;
          pinyin_content?: string;
        } = { language };

        if (isChinese && !row.pinyin_content) {
          update.pinyin_content = convertToRubyPinyin(row.content || "");
          pinyinGenerated++;
        }

        const { error: updateErr } = await supabase
          .from("reading_articles")
          .update(update)
          .eq("id", row.id);

        if (updateErr) {
          console.error(`Update failed for ${row.id}:`, updateErr.message);
          errors++;
        } else {
          if (isChinese) fixedZh++;
          else fixedEn++;
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error(`Unexpected error for ${row.id}:`, reason);
        errors++;
      }
    }

    processed += rows.length;
    console.log(`Progress: ${processed}/${total}`);
  }

  console.log("\nDone.");
  console.log(`  Total processed : ${processed}`);
  console.log(`  Fixed zh        : ${fixedZh}`);
  console.log(`  Fixed en        : ${fixedEn}`);
  console.log(`  Pinyin generated: ${pinyinGenerated}`);
  console.log(`  Errors          : ${errors}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
