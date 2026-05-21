#!/usr/bin/env tsx
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: allArticles, error } = await sb
    .from('reading_articles')
    .select('id, topic_key, title, status, category, grade_level, quality_issues, source, content_source, word_count, difficulty')
    .order('created_at', { ascending: false })
    .limit(500);

  if (!allArticles) {
    console.log('查询错误:', error?.message);
    return;
  }

  const total = allArticles.length;
  const statusMap: Record<string, number> = {};
  const categoryMap: Record<string, number> = {};
  const gradeMap: Record<string, number> = {};
  let withIssues = 0;
  let totalWords = 0;

  allArticles.forEach(a => {
    statusMap[a.status] = (statusMap[a.status] || 0) + 1;
    categoryMap[a.category || 'N/A'] = (categoryMap[a.category || 'N/A'] || 0) + 1;
    const g = `G${a.grade_level}`;
    gradeMap[g] = (gradeMap[g] || 0) + 1;
    if (a.quality_issues && (a.quality_issues as any[]).length > 0) withIssues++;
    totalWords += (a.word_count as number) || 0;
  });

  console.log('=== 文章总数:', total, '===');
  console.log('\n--- 状态分布 ---');
  Object.entries(statusMap).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  console.log('有 quality_issues:', withIssues);

  console.log('\n--- 分类分布 ---');
  Object.entries(categoryMap).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  console.log('\n--- 年级分布 ---');
  Object.entries(gradeMap).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  console.log('\n--- 平均字数 ---');
  console.log(`  ${Math.round(totalWords / total)} 字/篇`);

  const sourceMap: Record<string, number> = {};
  allArticles.forEach(a => {
    const s = (a.source as string) || 'N/A';
    sourceMap[s] = (sourceMap[s] || 0) + 1;
  });
  console.log('\n--- 来源分布 ---');
  Object.entries(sourceMap).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  const contentSourceMap: Record<string, number> = {};
  allArticles.forEach(a => {
    const s = (a.content_source as string) || 'N/A';
    contentSourceMap[s] = (contentSourceMap[s] || 0) + 1;
  });
  console.log('\n--- content_source 分布 ---');
  Object.entries(contentSourceMap).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  let under300 = 0, under500 = 0, under800 = 0, over800 = 0;
  allArticles.forEach(a => {
    const wc = a.word_count as number || 0;
    if (wc < 300) under300++;
    else if (wc < 500) under500++;
    else if (wc < 800) under800++;
    else over800++;
  });
  console.log('\n--- 字数分布 ---');
  console.log(`  <300字: ${under300}`);
  console.log(`  300-499: ${under500}`);
  console.log(`  500-799: ${under800}`);
  console.log(`  >=800:  ${over800}`);

  const draft = allArticles.filter(a => a.status !== 'published');
  if (draft.length > 0) {
    console.log(`\n--- 未发布文章 (${draft.length}) ---`);
    draft.slice(0, 20).forEach(a => {
      const issues = (a.quality_issues as any[])?.length || 0;
      console.log(`  [${a.status}] ${a.topic_key} | ${a.title?.slice(0,40)} | issues:${issues}`);
    });
  }

  const { count: qCount } = await sb.from('reading_questions').select('*', { count: 'exact', head: true });
  console.log(`\n--- 题目总数: ${qCount} ---`);

  const { count: illCount } = await sb.from('reading_article_illustrations').select('*', { count: 'exact', head: true });
  console.log(`--- 插图总数: ${illCount} ---`);
}

main().catch(console.error);