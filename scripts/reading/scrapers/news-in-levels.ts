#!/usr/bin/env npx tsx

/**
 * News in Levels Scraper
 *
 * Scrapes articles from newsinlevels.com at three difficulty levels (L1/L2/L3)
 * and upserts them into the reading_topics table.
 *
 * Usage:
 *   npx tsx scripts/reading/scrapers/news-in-levels.ts [--dry-run]
 *
 * Environment:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Types
interface ArticleLevel {
  level: 1 | 2 | 3;
  title: string;
  content: string;
}

interface Article {
  url: string;
  slug: string;
  category: string;
  levels: ArticleLevel[];
}

// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DRY_RUN = process.argv.includes("--dry-run");

// Grade mapping per requirements: Level 1 → grade 3, Level 2 → grade 5, Level 3 → grade 8
const LEVEL_TO_GRADE: Record<number, number[]> = {
  1: [3, 4],
  2: [5, 6],
  3: [8, 9],
};

// Categories to scrape from newsinlevels.com
const CATEGORIES = [
  "news",
  "nature",
  "history",
  "information",
  "sport",
  "interesting",
  "funny",
  "exercises",
];

// Helper: Create Supabase client
function createSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error(
      "Missing environment variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  return createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

// Helper: Fetch HTML content with SSL bypass for development
async function fetchHtml(url: string): Promise<string> {
  // Bypass SSL verification for development environments
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

// Helper: Extract article links from a category page
function extractArticleLinks(html: string, category: string): string[] {
  const links: Set<string> = new Set();
  const baseUrl = "https://newsinlevels.com";

  // Match article links: /2024/05/title-of-article/
  // Pattern matches typical WordPress permalink structure
  const articlePattern = /href="(\/[0-9]{4}\/[0-9]{2}\/[^"]+)"\s+title="[^"]*"/g;
  let match;

  while ((match = articlePattern.exec(html)) !== null) {
    const href = match[1];
    // Filter out pagination and other non-article links
    if (
      !href.includes("/page/") &&
      !href.includes("/category/") &&
      !href.includes("/tag/") &&
      !href.includes("/author/")
    ) {
      links.add(baseUrl + href);
    }
  }

  // Also match links with "Read more" or article-related text
  const readMorePattern = /href="([^"]+)"[^>]*>[\s]*Read more[\s]*</gi;
  while ((match = readMorePattern.exec(html)) !== null) {
    const href = match[1];
    if (href.startsWith("/")) {
      links.add(baseUrl + href);
    } else if (href.startsWith("http")) {
      links.add(href);
    }
  }

  return Array.from(links);
}

// Helper: Extract slug from URL
function extractSlug(url: string): string {
  // Extract the path after the date pattern: /2024/05/title-slug/
  const match = url.match(/\/[0-9]{4}\/[0-9]{2}\/([^/]+)/);
  return match ? match[1] : url.split("/").pop() || "";
}

// Helper: Extract article content from an article page
function extractArticleContent(html: string): ArticleLevel[] {
  const levels: ArticleLevel[] = [];

  // newsinlevels.com typically has three sections for each level
  // Look for patterns like: "Level 1", "Level 2", "Level 3" headers
  // or simple text blocks separated by level markers

  // Try to find level sections
  // Pattern 1: Level headers with content after them
  const levelPatterns = [
    /Level\s*1[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=Level\s*2|$)/gi,
    /Level\s*2[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=Level\s*3|$)/gi,
    /Level\s*3[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=$)/gi,
  ];

  for (let i = 0; i < 3; i++) {
    const levelNum = i + 1;
    const pattern = levelPatterns[i];
    pattern.lastIndex = 0;

    const match = pattern.exec(html);
    if (match) {
      const titleMatch = match[1].replace(/<[^>]+>/g, "").trim();
      const contentMatch = match[2]
        .replace(/<[^>]+>/g, " ") // Remove HTML tags but preserve text
        .replace(/\s+/g, " ") // Normalize whitespace
        .trim();

      if (titleMatch && contentMatch) {
        levels.push({
          level: levelNum as 1 | 2 | 3,
          title: titleMatch,
          content: contentMatch,
        });
      }
    }
  }

  // Fallback: Try to extract text blocks by looking for article content divs
  if (levels.length === 0) {
    // Look for article content containers
    const articleContentPattern =
      /<div[^>]*class="[^"]*article[^"]*post[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
    let match;

    while ((match = articleContentPattern.exec(html)) !== null) {
      const content = match[1]
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (content.length > 100) {
        // Likely real content
        levels.push({
          level: 1,
          title: "Article",
          content: content,
        });
        break;
      }
    }
  }

  return levels;
}

// Helper: Extract title from article page
function extractTitle(html: string): string {
  // Try to find the main article title
  const titleMatch = html.match(/<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
  if (titleMatch) {
    return titleMatch[1].replace(/<[^>]+>/g, "").trim();
  }

  // Fallback to page title
  const pageTitleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (pageTitleMatch) {
    return pageTitleMatch[1]
      .replace(/\|[\s\S]*$/, "") // Remove " | News in Levels"
      .trim();
  }

  return "Untitled";
}

// Helper: Scrape a single article
async function scrapeArticle(url: string, category: string): Promise<Article | null> {
  try {
    console.log(`  Scraping: ${url}`);

    const html = await fetchHtml(url);
    const slug = extractSlug(url);
    const title = extractTitle(html);
    const levels = extractArticleContent(html);

    if (levels.length === 0) {
      console.warn(`  Warning: No level content found for ${url}`);
      return null;
    }

    return {
      url,
      slug,
      category,
      levels,
    };
  } catch (error) {
    console.error(`  Error scraping ${url}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

// Helper: Scrape all articles from a category page
async function scrapeCategory(category: string): Promise<Article[]> {
  const categoryUrl = `https://newsinlevels.com/category/${category}/`;
  console.log(`\nScraping category: ${category}`);

  try {
    const html = await fetchHtml(categoryUrl);
    const articleUrls = extractArticleLinks(html, category);

    console.log(`  Found ${articleUrls.length} article links`);

    const articles: Article[] = [];

    for (const articleUrl of articleUrls) {
      const article = await scrapeArticle(articleUrl, category);
      if (article) {
        articles.push(article);
      }
    }

    return articles;
  } catch (error) {
    console.error(`  Error scraping category ${category}:`, error instanceof Error ? error.message : error);
    return [];
  }
}

// Helper: Generate topic_key for a record
function generateTopicKey(slug: string, level: number): string {
  return `news-in-levels-${slug}-L${level}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsertArticle(
  supabase: any,
  article: Article,
  levelData: ArticleLevel
): Promise<boolean> {
  const topicKey = generateTopicKey(article.slug, levelData.level);
  const targetGrades = LEVEL_TO_GRADE[levelData.level];

  const record = {
    topic_key: topicKey,
    language: "en",
    source: "news-in-levels",
    source_text: levelData.content,
    source_url: article.url,
    category: article.category,
    grade_level: levelData.level === 1 ? 3 : levelData.level === 2 ? 5 : 8,
    target_grades: targetGrades,
    status: "active",
    title: levelData.title,
  };

  if (DRY_RUN) {
    console.log("  [DRY-RUN] Would upsert:", {
      topic_key: topicKey,
      language: "en",
      source: "news-in-levels",
      category: article.category,
      grade_level: record.grade_level,
      target_grades: targetGrades,
      title: levelData.title.substring(0, 50) + (levelData.title.length > 50 ? "..." : ""),
      content_length: levelData.content.length,
    });
    return true;
  }

  const { error } = await (supabase as any)
    .from("reading_topics")
    .upsert(record, {
      onConflict: "topic_key",
    });

  if (error) {
    console.error(`  Error upserting ${topicKey}:`, error.message);
    return false;
  }

  return true;
}

// Main execution
async function main() {
  console.log("=".repeat(60));
  console.log("News in Levels Scraper");
  console.log("=".repeat(60));
  console.log(`Mode: ${DRY_RUN ? "DRY-RUN (no changes will be made)" : "LIVE (writing to database)"}`);
  console.log(`Categories: ${CATEGORIES.join(", ")}`);
  console.log("=".repeat(60));

  const supabase = DRY_RUN ? null : createSupabase();
  let totalArticles = 0;
  let totalLevels = 0;
  let successCount = 0;

  for (const category of CATEGORIES) {
    const articles = await scrapeCategory(category);
    totalArticles += articles.length;

    for (const article of articles) {
      totalLevels += article.levels.length;

      for (const levelData of article.levels) {
        const success = DRY_RUN
          ? true
          : await upsertArticle(supabase as NonNullable<typeof supabase>, article, levelData);

        if (success) {
          successCount++;
        }
      }
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("Summary");
  console.log("=".repeat(60));
  console.log(`Categories processed: ${CATEGORIES.length}`);
  console.log(`Articles scraped: ${totalArticles}`);
  console.log(`Level records: ${totalLevels}`);
  console.log(`${DRY_RUN ? "Would insert" : "Inserted"}: ${successCount} records`);
  console.log("=".repeat(60));

  if (DRY_RUN) {
    console.log("\nTo execute the actual write, run without --dry-run flag.");
  }
}

// Run the scraper
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
