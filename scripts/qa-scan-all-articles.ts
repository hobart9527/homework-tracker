#!/usr/bin/env tsx
/**
 * QA Scan v3 — 全量阅读文章质检 (修正版)
 *
 * 修复v2问题：
 *  - reading_articles 表没有 genre / author_purpose / cultural_connection 列
 *    这些字段仅存在于 TypeScript types，跳过校验
 *  - 正确处理 real DB 字段
 *
 * 用法:
 *   npx tsx scripts/qa-scan-all-articles.ts [--limit N] [--status published|draft] [--fix-priority]
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import {
  validateContent,
  validateIBCriteria,
  validateFactualAccuracy,
} from "@/lib/reading";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const PAGE_SIZE = 50;
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ---------------------------------------------------------------------------
// Priority classifier — 只基于 DB 中实际存在的字段判断
// ---------------------------------------------------------------------------
interface IssueDetail {
  source: string;
  code: string;
  severity: "info" | "warn" | "error";
  message: string;
}

interface ScanResult {
  articleId: string;
  topicKey: string;
  title: string;
  status: string;
  category: string;
  gradeLevel: number;
  language: string;
  wordCount: number;
  difficulty: number;
  source: string | null;
  contentLength: number;
  hasQuestions: boolean;
  questionCount: number;
  priority: "P0" | "P1" | "P2" | "P3";
  priorityReason: string;
  issues: IssueDetail[];
  errorCount: number;
  warnCount: number;
  infoCount: number;
}

function classifyPriority(
  issues: IssueDetail[],
  contentLength: number,
  wordCount: number,
  hasQuestions: boolean
): { priority: ScanResult["priority"]; reason: string } {
  const errorCodes = issues
    .filter((i) => i.severity === "error")
    .map((i) => i.code);
  const hasError = errorCodes.length > 0;

  // P0: 内容为空
  if (contentLength === 0 || wordCount === 0) {
    return { priority: "P0", reason: "内容为空，需重新生成" };
  }

  // P0: 内容膨胀严重
  if (errorCodes.includes("content-bloat-error")) {
    return { priority: "P0", reason: "内容膨胀严重，需约束重写" };
  }

  // P1: 有 error 但内容存在
  if (hasError) {
    return {
      priority: "P1",
      reason: `存在错误: ${errorCodes.join(", ")}`,
    };
  }

  // P2: 只有 warn/info 的有效内容
  if (issues.some((i) => i.severity === "warn")) {
    return { priority: "P2", reason: "存在警告，可选择性修复" };
  }

  return { priority: "P3", reason: "无问题" };
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------
async function loadAllArticles(
  statusFilter?: string
): Promise<{ articles: any[]; totalCount: number }> {
  let query = sb
    .from("reading_articles")
    .select(
      "*, reading_questions(id, article_id, question_text, question_type, options, correct_answer, difficulty, order_index)"
    )
    .order("created_at", { ascending: false });

  if (statusFilter) query = query.eq("status", statusFilter);

  const allArticles: any[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await sb
      .from("reading_articles")
      .select(
        "*, reading_questions(id, article_id, question_text, question_type, options, correct_answer, difficulty, order_index)"
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error("分页加载错误:", error.message);
      break;
    }
    if (!data || data.length === 0) break;
    allArticles.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return { articles: allArticles, totalCount: allArticles.length };
}

async function loadSourceTextMap(): Promise<
  Record<string, { sourceText: string | null; keyFacts: string[] | null }>
> {
  const map: Record<string, { sourceText: string | null; keyFacts: string[] | null }> = {};
  let offset = 0;

  while (true) {
    const { data, error } = await sb
      .from("reading_topics")
      .select("topic_key, source_text, key_facts")
      .range(offset, offset + 100 - 1);

    if (error || !data) break;
    for (const t of data) {
      map[t.topic_key] = { sourceText: t.source_text, keyFacts: t.key_facts };
    }
    if (data.length < 100) break;
    offset += 100;
  }

  return map;
}

// ---------------------------------------------------------------------------
// Main scan
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const statusFilter = args.find((a) => a.startsWith("--status="));
  const fixPriorityFlag = args.includes("--fix-priority");

  const statusFilterValue = statusFilter
    ? statusFilter.split("=")[1]
    : undefined;

  console.log("=== QA Scan v3 — 全量文章质检 (修正版) ===\n");

  const { articles, totalCount } = await loadAllArticles(statusFilterValue);
  console.log(`加载文章: ${articles.length} 篇\n`);

  const sourceTextMap = await loadSourceTextMap();
  console.log(`加载主题源文本: ${Object.keys(sourceTextMap).length} 个\n`);

  console.log("开始逐篇扫描...\n");
  const results: ScanResult[] = [];
  let progress = 0;

  for (const article of articles) {
    progress++;
    if (progress % 25 === 0 || progress === articles.length) {
      process.stdout.write(
        `\r  进度: ${progress}/${articles.length} (${Math.round(
          (progress / articles.length) * 100
        )}%)`
      );
    }

    const content = article.content || "";
    const wordCount = article.word_count || 0;
    const language = (article.language as "zh" | "en") || "en";
    const gradeLevel = article.grade_level || 3;

    // 构建 article 对象 — 用 DB 实际字段，缺失的 IB 字段留 undefined
    const fullArticle = {
      ...article,
      content,
      word_count: wordCount,
      difficulty: article.difficulty || 3,
      scene_description: article.scene_description || "",
      // 这些列实际不存在于 DB，会是 undefined
      genre: article.genre || undefined,
      author_purpose: article.author_purpose || undefined,
      cultural_connection: article.cultural_connection || undefined,
      classical_quote: article.classical_quote || undefined,
      factual_accuracy: article.factual_accuracy || undefined,
    };

    const questions = (article.reading_questions || [])
      .sort((a: any, b: any) => (a.order_index || 0) - (b.order_index || 0))
      .map((q: any) => ({
        question_text: q.question_text || "",
        question_type: q.question_type || "detail",
        options: q.options || [],
        correct_answer: q.correct_answer || "A",
        difficulty: q.difficulty || 3,
      }));

    // 3 quality gates
    const gateResult = validateContent({
      article: fullArticle as any,
      questions,
      language,
      gradeLevel,
    });

    const ibResult = validateIBCriteria({
      article: fullArticle as any,
      questions,
      language,
      gradeLevel,
    });

    const sourceInfo = sourceTextMap[article.topic_key] || {
      sourceText: null,
      keyFacts: null,
    };
    const factualResult = validateFactualAccuracy({
      article: fullArticle as any,
      sourceText: sourceInfo.sourceText || undefined,
      keyFacts: sourceInfo.keyFacts || undefined,
      language,
      gradeLevel,
    });

    // Merge issues — SKIP genre-missing / author-purpose-missing / cultural-connection-missing
    // because those columns don't exist in the DB yet
    const skipCodes = new Set([
      "genre-missing",
      "author-purpose-missing",
      "cultural-connection-missing",
    ]);

    const allIssues: IssueDetail[] = [];
    const addIssues = (src: string, issues: any[]) => {
      for (const i of issues) {
        if (!skipCodes.has(i.code)) {
          allIssues.push({ ...i, source: src });
        }
      }
    };
    addIssues("quality", gateResult.issues);
    addIssues("ib-criteria", ibResult.issues);
    addIssues("factual", factualResult.issues);

    const { priority, reason } = classifyPriority(
      allIssues,
      content.length,
      wordCount,
      questions.length > 0
    );

    results.push({
      articleId: article.id,
      topicKey: article.topic_key,
      title: article.title || "",
      status: article.status || "unknown",
      category: article.category || "",
      gradeLevel,
      language,
      wordCount,
      difficulty: article.difficulty || 0,
      source: article.source || null,
      contentLength: content.length,
      hasQuestions: questions.length > 0,
      questionCount: questions.length,
      priority,
      priorityReason: reason,
      issues: allIssues,
      errorCount: allIssues.filter((i) => i.severity === "error").length,
      warnCount: allIssues.filter((i) => i.severity === "warn").length,
      infoCount: allIssues.filter((i) => i.severity === "info").length,
    });
  }

  console.log("\n\n");

  // Aggregate
  const priorityGroups = { P0: [] as ScanResult[], P1: [] as ScanResult[], P2: [] as ScanResult[], P3: [] as ScanResult[] };
  results.forEach((r) => priorityGroups[r.priority].push(r));

  const issueCodeStats: Record<string, { count: number; errors: number; warns: number; infos: number }> = {};
  results.forEach((r) => {
    r.issues.forEach((issue) => {
      if (!issueCodeStats[issue.code]) {
        issueCodeStats[issue.code] = { count: 0, errors: 0, warns: 0, infos: 0 };
      }
      issueCodeStats[issue.code].count++;
      if (issue.severity === "error") issueCodeStats[issue.code].errors++;
      if (issue.severity === "warn") issueCodeStats[issue.code].warns++;
      if (issue.severity === "info") issueCodeStats[issue.code].infos++;
    });
  });

  const clean = results.filter((r) => r.issues.length === 0).length;
  const dirty = results.filter((r) => r.issues.length > 0).length;

  const skippedCodes = ["genre-missing", "author-purpose-missing", "cultural-connection-missing"];

  console.log("=".repeat(70));
  console.log("QA SCAN v3 汇总报告");
  console.log("=".repeat(70));
  console.log(`扫描文章: ${results.length} 篇`);
  console.log(`无问题:   ${clean} 篇 (${Math.round((clean / results.length) * 100)}%)`);
  console.log(`有问题:   ${dirty} 篇 (${Math.round((dirty / results.length) * 100)}%)`);
  console.log(`跳过误报: ${skippedCodes.join(", ")}`);
  console.log("");

  console.log("--- 优先级分布 ---");
  for (const p of ["P0", "P1", "P2", "P3"]) {
    const g = priorityGroups[p as keyof typeof priorityGroups];
    console.log(`  ${p}: ${g.length} 篇`);
  }

  console.log("\n--- 问题代码分布 ---");
  const sortedCodes = Object.entries(issueCodeStats).sort(
    (a, b) => b[1].count - a[1].count
  );
  for (const [code, stats] of sortedCodes) {
    console.log(
      `  ${code}: ${stats.count}次 (E:${stats.errors} W:${stats.warns} I:${stats.infos})`
    );
  }

  // P0 detail
  if (priorityGroups.P0.length > 0) {
    console.log("\n--- P0 紧急 (需重生成) ---");
    for (const r of priorityGroups.P0) {
      console.log(
        `  [${r.language}] ${r.topicKey} | ${r.title.slice(0, 50)} | G${r.gradeLevel} | ${r.contentLength} chars | Q:${r.questionCount}`
      );
    }
  }

  // P1 detail
  if (priorityGroups.P1.length > 0) {
    console.log("\n--- P1 重要 ---");
    for (const r of priorityGroups.P1.slice(0, 30)) {
      const topIssue = r.issues.find((i) => i.severity === "error");
      console.log(
        `  [${r.language}] ${r.topicKey} | ${r.title.slice(0, 50)} | G${r.gradeLevel} | main: ${topIssue?.code || "?"}`
      );
    }
    if (priorityGroups.P1.length > 30) {
      console.log(`  ... 还有 ${priorityGroups.P1.length - 30} 篇`);
    }
  }

  // Stats
  console.log("\n--- 按来源分布 ---");
  const srcGroups: Record<string, { total: number; clean: number; dirty: number }> = {};
  results.forEach((r) => {
    const s = r.source || "unknown";
    if (!srcGroups[s]) srcGroups[s] = { total: 0, clean: 0, dirty: 0 };
    srcGroups[s].total++;
    if (r.issues.length === 0) srcGroups[s].clean++;
    else srcGroups[s].dirty++;
  });
  for (const [src, stats] of Object.entries(srcGroups).sort(
    (a, b) => b[1].total - a[1].total
  )) {
    console.log(`  ${src}: ${stats.total}篇 (${stats.clean}干净/${stats.dirty}有问题)`);
  }

  console.log("\n--- 按语言分布 ---");
  const langGroups: Record<string, { total: number; clean: number; dirty: number }> = {};
  results.forEach((r) => {
    const s = r.language;
    if (!langGroups[s]) langGroups[s] = { total: 0, clean: 0, dirty: 0 };
    langGroups[s].total++;
    if (r.issues.length === 0) langGroups[s].clean++;
    else langGroups[s].dirty++;
  });
  for (const [lang, stats] of Object.entries(langGroups)) {
    console.log(`  ${lang}: ${stats.total}篇 (${stats.clean}干净/${stats.dirty}有问题)`);
  }

  console.log("\n--- 字数分布 ---");
  const wcBuckets: Record<string, number> = { "<300": 0, "300-500": 0, "500-800": 0, "800-1200": 0, ">=1200": 0 };
  results.forEach((r) => {
    const key = r.wordCount < 300 ? "<300" : r.wordCount < 500 ? "300-500" : r.wordCount < 800 ? "500-800" : r.wordCount < 1200 ? "800-1200" : ">=1200";
    wcBuckets[key]++;
  });
  for (const [bucket, count] of Object.entries(wcBuckets)) {
    console.log(`  ${bucket}: ${count}`);
  }

  console.log("\n--- 题目数量分布 ---");
  const qBuckets: Record<string, number> = { "0题": 0, "1-3题": 0, "4-5题": 0, "6-8题": 0, "9+题": 0 };
  results.forEach((r) => {
    const key = r.questionCount === 0 ? "0题" : r.questionCount <= 3 ? "1-3题" : r.questionCount <= 5 ? "4-5题" : r.questionCount <= 8 ? "6-8题" : "9+题";
    qBuckets[key]++;
  });
  for (const [bucket, count] of Object.entries(qBuckets)) {
    console.log(`  ${bucket}: ${count}`);
  }

  // JSON report
  const fs = await import("fs");
  const report = {
    generatedAt: new Date().toISOString(),
    scanVersion: "v3-corrected",
    totalArticles: results.length,
    skippedCodes,
    summary: {
      clean,
      dirty,
      byPriority: {
        P0: priorityGroups.P0.length,
        P1: priorityGroups.P1.length,
        P2: priorityGroups.P2.length,
        P3: priorityGroups.P3.length,
      },
      issueCodeStats,
    },
    results: results.map((r) => ({
      articleId: r.articleId,
      topicKey: r.topicKey,
      title: r.title,
      status: r.status,
      gradeLevel: r.gradeLevel,
      language: r.language,
      priority: r.priority,
      priorityReason: r.priorityReason,
      errorCount: r.errorCount,
      warnCount: r.warnCount,
      issueCodes: r.issues.map((i) => `${i.source}/${i.code}`),
    })),
  };

  const reportPath = "/Users/Shared/projects/homework-tracker/scripts/qa-scan-report.json";
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");
  console.log(`\nJSON 报告: ${reportPath}`);

  // Fix plan
  if (fixPriorityFlag) {
    const plan: string[] = [];
    plan.push("# QA 修复计划 v3");
    plan.push(`# 生成时间: ${new Date().toISOString()}`);
    plan.push(`# 总文章数: ${results.length}`);
    plan.push("");

    for (const r of priorityGroups.P0) {
      plan.push(
        `P0 | RE-GENERATE | ${r.articleId} | ${r.topicKey} | ${r.language} | G${r.gradeLevel} | content为空`
      );
    }
    for (const r of priorityGroups.P1) {
      const mainIssue = r.issues.find((i) => i.severity === "error")?.code;
      if (mainIssue === "word-count-out-of-range" || mainIssue === "content-bloat-error") {
        plan.push(
          `P1 | RE-GENERATE-SIZED | ${r.articleId} | ${r.topicKey} | ${r.language} | G${r.gradeLevel} | ${mainIssue}`
        );
      } else {
        plan.push(
          `P1 | REGENERATE-META | ${r.articleId} | ${r.topicKey} | ${r.language} | G${r.gradeLevel} | ${mainIssue}`
        );
      }
    }
    for (const r of priorityGroups.P2) {
      const warns = r.issues.filter((i) => i.severity === "warn").map((i) => i.code);
      plan.push(
        `P2 | REVIEW | ${r.articleId} | ${r.topicKey} | ${r.language} | G${r.gradeLevel} | warns: ${warns.join(", ")}`
      );
    }

    const planPath = "/Users/Shared/projects/homework-tracker/scripts/qa-fix-plan.txt";
    fs.writeFileSync(planPath, plan.join("\n"), "utf-8");
    console.log(`修复计划: ${planPath}`);
  }
}

main().catch((err) => {
  console.error("\n扫描失败:", err);
  process.exit(1);
});