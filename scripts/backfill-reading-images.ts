#!/usr/bin/env node

import { config } from "dotenv";

config({ path: ".env.local" });
validateEnv();

const readingMod = await import("@/lib/reading");
const supabaseMod = await import("@/lib/supabase/server");
const generateCover = readingMod.generateCover;
const generateIllustrations = readingMod.generateIllustrations;
const createServiceRoleClient = supabaseMod.createServiceRoleClient;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ArticleRow {
  id: string;
  title: string;
  language: string;
  category: string;
  scene_description: string | null;
  cover_image_url: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * DB CHECK on reading_article_illustrations.source allows 'minimax'|'pollinations'.
 * The illustration generator may return "source-website" or "dalle";
 * map these to "pollinations" when inserting.
 */
function mapSourceForDb(source: string): string {
  return source === "source-website" || source === "dalle" ? "pollinations" : source;
}

function validateEnv(): void {
  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "OPENAI_API_KEY",
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    const err = new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    ) as Error & { code: string };
    err.code = "ERR_MISSING_ENV";
    throw err;
  }
}

function parseLimit(): number {
  const arg = process.argv.find((a) => a.startsWith("--limit="));
  if (!arg) return 0;
  const n = parseInt(arg.split("=")[1], 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const limit = parseLimit();
  console.log("=== Backfill Reading Images ===\n");
  if (limit > 0) console.log(`Limit: ${limit}\n`);

  const supabase = await createServiceRoleClient();

  // 4. Query articles missing covers (null or placeholder pending.webp)
  console.log("Querying articles missing covers...");
  const { data: noCoverData, error: noCoverErr } = await supabase
    .from("reading_articles")
    .select("id, title, language, category, scene_description, cover_image_url")
    .or("cover_image_url.is.null,cover_image_url.like.%pending.webp")
    .order("created_at", { ascending: true });
  if (noCoverErr) throw new Error(`Cover query failed: ${noCoverErr.message}`);
  console.log(`  ${(noCoverData ?? []).length} articles missing covers\n`);

  // 5. Query articles with zero reading_article_illustrations
  console.log("Querying articles missing illustrations...");
  const { data: existingIllRows } = await supabase
    .from("reading_article_illustrations")
    .select("article_id");
  const existingIllIds = new Set(
    (existingIllRows ?? []).map((r) => r.article_id)
  );
  console.log(`  ${existingIllIds.size} articles already have illustrations`);

  const { data: sceneData, error: sceneErr } = await supabase
    .from("reading_articles")
    .select("id, title, language, category, scene_description, cover_image_url")
    .not("scene_description", "is", null)
    .order("created_at", { ascending: true });
  if (sceneErr) throw new Error(`Scene query failed: ${sceneErr.message}`);

  const missingIllArticles = (sceneData ?? []).filter(
    (a) => !existingIllIds.has(a.id)
  );
  console.log(`  ${missingIllArticles.length} articles missing illustrations\n`);

  // Combine and deduplicate
  const seen = new Set<string>();
  const articles: ArticleRow[] = [];
  for (const a of [...(noCoverData ?? []), ...missingIllArticles]) {
    if (!seen.has(a.id)) {
      seen.add(a.id);
      articles.push(a);
    }
  }

  if (articles.length === 0) {
    console.log("No articles need backfill.");
    return;
  }

  const batch = limit > 0 ? articles.slice(0, limit) : articles;
  console.log(`Processing ${batch.length} articles (concurrency=1)\n`);

  let coverOk = 0;
  let coverFail = 0;
  let illOk = 0;
  let illFail = 0;

  for (let i = 0; i < batch.length; i++) {
    const a = batch[i];
    console.log(`[${i + 1}/${batch.length}] ${a.id} "${a.title}"`);

    // 6. Generate cover if missing or placeholder
    if (!a.cover_image_url || a.cover_image_url.endsWith("pending.webp")) {
      try {
        const result = await generateCover({
          articleId: a.id,
          language: a.language as "zh" | "en",
          category: a.category,
          scene: a.scene_description || a.title,
          title: a.title,
        });
        const { error: ue } = await supabase
          .from("reading_articles")
          .update({
            cover_image_url: result.url,
            cover_source: result.source,
            cover_source_url: result.source_url,
          })
          .eq("id", a.id);
        if (ue) throw new Error(`DB update failed: ${ue.message}`);
        console.log(`  Cover: OK (${result.source})`);
        coverOk++;
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.warn(`  Cover: FAIL — ${reason}`);
        coverFail++;
      }
    }

    // 7. Generate illustration if scene_description exists AND no illustrations
    if (a.scene_description && !existingIllIds.has(a.id)) {
      try {
        const results = await generateIllustrations({
          articleId: a.id,
          language: a.language as "zh" | "en",
          category: a.category,
          scenes: [
            { paragraphIndex: 0, sceneDescription: a.scene_description },
          ],
        });
        if (results.length > 0) {
          const { error: ie } = await supabase
            .from("reading_article_illustrations")
            .insert(
              results.map((r) => ({
                article_id: a.id,
                paragraph_index: r.paragraph_index,
                image_url: r.url,
                source_url: r.source_url,
                source: mapSourceForDb(r.source),
                scene_description: a.scene_description,
              }))
            );
          if (ie) throw new Error(`DB insert failed: ${ie.message}`);
          console.log(
            `  Illustration: OK (${results.length} images)`
          );
          illOk += results.length;
        } else {
          console.log("  Illustration: SKIP (no images from generator)");
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.warn(`  Illustration: FAIL — ${reason}`);
        illFail++;
      }
    }
  }

  console.log("\n=== BACKFILL COMPLETE ===");
  console.log(`Processed:    ${batch.length}`);
  console.log(`Covers:       ${coverOk} OK, ${coverFail} FAIL`);
  console.log(`Illustrations: ${illOk} OK, ${illFail} FAIL`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("\nFatal error:", message);
  if ((err as Error & { code?: string }).code === "ERR_MISSING_ENV") {
    console.error(
      "Configure .env.local with the required environment variables."
    );
  }
  process.exit(1);
});
