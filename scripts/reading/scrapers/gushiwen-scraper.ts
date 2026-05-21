#!/usr/bin/env npx tsx

/**
 * Gushiwen Corpus Scraper
 *
 * Bundled corpus of 15 well-known classical Chinese poems/prose suitable for
 * elementary and middle-school students. Uses the classic-corpus pattern
 * (no live web scraping) to upsert into the reading_topics table for
 * Route A publication (original text, no LLM rewrite).
 *
 * Usage:
 *   npx tsx scripts/reading/scrapers/gushiwen-scraper.ts [--dry-run] [--limit N]
 *
 * Environment:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { extractImages } from "../../../src/lib/reading/source-image-extractor";

config({ path: ".env.local" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PoemEntry {
  title: string;
  author: string;
  dynasty: string;
  content: string; // full poem/prose text
  category: string;
  target_grades: number[];
}

interface CliArgs {
  dryRun: boolean;
  limit: number;
}

// ---------------------------------------------------------------------------
// Corpus data
// ---------------------------------------------------------------------------

const POEMS: PoemEntry[] = [
  { title: "静夜思", author: "李白", dynasty: "唐", content: "床前明月光，疑是地上霜。举头望明月，低头思故乡。", category: "唐诗", target_grades: [3,5] },
  { title: "登鹳雀楼", author: "王之涣", dynasty: "唐", content: "白日依山尽，黄河入海流。欲穷千里目，更上一层楼。", category: "唐诗", target_grades: [3,5] },
  { title: "春晓", author: "孟浩然", dynasty: "唐", content: "春眠不觉晓，处处闻啼鸟。夜来风雨声，花落知多少。", category: "唐诗", target_grades: [3,5] },
  { title: "悯农", author: "李绅", dynasty: "唐", content: "锄禾日当午，汗滴禾下土。谁知盘中餐，粒粒皆辛苦。", category: "唐诗", target_grades: [3,5] },
  { title: "咏鹅", author: "骆宾王", dynasty: "唐", content: "鹅，鹅，鹅，曲项向天歌。白毛浮绿水，红掌拨清波。", category: "唐诗", target_grades: [3,5] },
  { title: "望庐山瀑布", author: "李白", dynasty: "唐", content: "日照香炉生紫烟，遥看瀑布挂前川。飞流直下三千尺，疑是银河落九天。", category: "唐诗", target_grades: [5,6] },
  { title: "绝句", author: "杜甫", dynasty: "唐", content: "两个黄鹂鸣翠柳，一行白鹭上青天。窗含西岭千秋雪，门泊东吴万里船。", category: "唐诗", target_grades: [5,6] },
  { title: "游子吟", author: "孟郊", dynasty: "唐", content: "慈母手中线，游子身上衣。临行密密缝，意恐迟迟归。谁言寸草心，报得三春晖。", category: "唐诗", target_grades: [5,6] },
  { title: "江雪", author: "柳宗元", dynasty: "唐", content: "千山鸟飞绝，万径人踪灭。孤舟蓑笠翁，独钓寒江雪。", category: "唐诗", target_grades: [5,6] },
  { title: "饮湖上初晴后雨", author: "苏轼", dynasty: "宋", content: "水光潋滟晴方好，山色空蒙雨亦奇。欲把西湖比西子，淡妆浓抹总相宜。", category: "宋诗", target_grades: [5,6] },
  { title: "元日", author: "王安石", dynasty: "宋", content: "爆竹声中一岁除，春风送暖入屠苏。千门万户曈曈日，总把新桃换旧符。", category: "宋诗", target_grades: [5,6] },
  { title: "水调歌头", author: "苏轼", dynasty: "宋", content: "明月几时有？把酒问青天。不知天上宫阙，今夕是何年。我欲乘风归去，又恐琼楼玉宇，高处不胜寒。起舞弄清影，何似在人间。转朱阁，低绮户，照无眠。不应有恨，何事长向别时圆？人有悲欢离合，月有阴晴圆缺，此事古难全。但愿人长久，千里共婵娟。", category: "宋词", target_grades: [6,7] },
  { title: "念奴娇·赤壁怀古", author: "苏轼", dynasty: "宋", content: "大江东去，浪淘尽，千古风流人物。故垒西边，人道是，三国周郎赤壁。乱石穿空，惊涛拍岸，卷起千堆雪。江山如画，一时多少豪杰。遥想公瑾当年，小乔初嫁了，雄姿英发。羽扇纶巾，谈笑间，樯橹灰飞烟灭。故国神游，多情应笑我，早生华发。人生如梦，一尊还酹江月。", category: "宋词", target_grades: [6,7] },
  { title: "陋室铭", author: "刘禹锡", dynasty: "唐", content: "山不在高，有仙则名。水不在深，有龙则灵。斯是陋室，惟吾德馨。苔痕上阶绿，草色入帘青。谈笑有鸿儒，往来无白丁。可以调素琴，阅金经。无丝竹之乱耳，无案牍之劳形。南阳诸葛庐，西蜀子云亭。孔子云：何陋之有？", category: "文言文", target_grades: [6,7] },
  { title: "爱莲说", author: "周敦颐", dynasty: "宋", content: "水陆草木之花，可爱者甚蕃。晋陶渊明独爱菊。自李唐来，世人甚爱牡丹。予独爱莲之出淤泥而不染，濯清涟而不妖，中通外直，不蔓不枝，香远益清，亭亭净植，可远观而不可亵玩焉。予谓菊，花之隐逸者也；牡丹，花之富贵者也；莲，花之君子者也。噫！菊之爱，陶后鲜有闻。莲之爱，同予者何人？牡丹之爱，宜乎众矣。", category: "文言文", target_grades: [6,7] },
];

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes("--dry-run"),
    limit: parseInt(args.find((a) => a.startsWith("--limit="))?.split("=")[1] || "15", 10),
  };
}

// ---------------------------------------------------------------------------
// Main scraper
// ---------------------------------------------------------------------------

async function scrapeGushiwenCorpus(args: CliArgs): Promise<{ success: number; skipped: number; failed: number }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const sb = createClient(supabaseUrl, supabaseKey);

  const poems = POEMS.slice(0, args.limit);
  let success = 0;
  let skipped = 0;
  let failed = 0;

  console.log(`[gushiwen-scraper] Starting corpus upsert (${poems.length} poems)...`);

  for (const poem of poems) {
    // Derive slug from title, keeping Chinese characters and ASCII letters
    const slug = poem.title.replace(/[^a-zA-Z一-鿿]/g, "-").toLowerCase();
    const topicKey = `gushiwen-${slug}`;

    // Check if already exists by source_url
    const { data: existing } = await sb
      .from("reading_topics")
      .select("topic_key")
      .eq("source_url", `gushiwen://${slug}`)
      .maybeSingle();

    if (existing) {
      console.log(`SKIP (exists): ${poem.title} (${topicKey})`);
      skipped++;
      continue;
    }

    if (args.dryRun) {
      console.log(`[DRY-RUN] Would add: ${topicKey} (${poem.category}) — ${poem.title}`);
      skipped++;
      continue;
    }

    // Insert into reading_topics
    const { error } = await sb.from("reading_topics").insert({
      topic_key: topicKey,
      language: "zh",
      category: poem.category,
      source: "gushiwen",
      source_text: poem.content,
      source_url: `gushiwen://${slug}`,
      content_completeness: "full",
      source_quality_score: 0.95,
      source_image_url: null,
      source_inline_image_urls: null,
      status: "active",
      target_grades: poem.target_grades,
    });

    if (error) {
      console.log(`  Insert failed for "${poem.title}": ${error.message}`);
      failed++;
    } else {
      console.log(`  Added: ${topicKey} (${poem.title})`);
      success++;
    }
  }

  console.log(`\n[gushiwen-scraper] Done: ${success} added, ${skipped} skipped, ${failed} failed`);
  return { success, skipped, failed };
}

// ---------------------------------------------------------------------------
// Export for CLI or programmatic use
// ---------------------------------------------------------------------------

export async function scrape(options?: { dryRun?: boolean; limit?: number }): Promise<{ success: number; skipped: number; failed: number }> {
  return scrapeGushiwenCorpus({
    dryRun: options?.dryRun ?? false,
    limit: options?.limit ?? 15,
  });
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

const isEntryPoint = process.argv[1]?.includes("gushiwen-scraper");
if (isEntryPoint) {
  const args = parseArgs();
  scrapeGushiwenCorpus(args).catch(console.error);
}
