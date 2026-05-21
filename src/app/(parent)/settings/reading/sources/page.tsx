"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SettingsShell } from "@/components/parent/SettingsShell";
import { Card } from "@/components/ui/Card";
import type { Database } from "@/lib/supabase/types";

type Article = Database["public"]["Tables"]["reading_articles"]["Row"];
type Topic = Database["public"]["Tables"]["reading_topics"]["Row"];

interface SourceInfo {
  key: string;
  label: string;
  description: string;
  topicCount: number;
  articleCount: number;
  activeTopicCount: number;
  lastScrapedAt: string | null;
  targetGrades: number[];
  languages: string[];
}

const SOURCE_DEFS: Record<string, { label: string; description: string }> = {
  dogo: { label: "DOGO News", description: "儿童新闻网站，英文时事/科学/自然/人物" },
  "news-in-levels": { label: "News in Levels", description: "分级英语新闻，Level 1-3 对应不同年级" },
  commonlit: { label: "CommonLit", description: "英文分级阅读图书馆，含阅读理解题" },
  icdl: { label: "ICDL", description: "国际儿童数字图书馆，中英文绘本和故事" },
  gushiwen: { label: "古诗文网", description: "中文古诗文经典作品" },
  "classic-corpus": { label: "经典语料", description: "内置经典中文/英文文本语料" },
  parent_news: { label: "家长投稿", description: "家长通过新闻投稿提交的文章链接" },
  manual: { label: "手动录入", description: "直接在数据库或后台录入的内容" },
};

export default function ReadingSourcesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [sources, setSources] = useState<SourceInfo[]>([]);

  useEffect(() => {
    const fetchSources = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }

      const [{ data: articles }, { data: topics }] = await Promise.all([
        supabase.from("reading_articles").select("topic_key,source,grade_level,language,status"),
        supabase.from("reading_topics").select("topic_key,source,status,target_grades,language,created_at"),
      ]);

      const articleRows = (articles ?? []) as Pick<Article, "topic_key" | "source" | "grade_level" | "language" | "status">[];
      const topicRows = (topics ?? []) as Pick<Topic, "topic_key" | "source" | "status" | "target_grades" | "language" | "created_at">[];

      // Aggregate by source
      const sourceMap = new Map<string, {
        topicKeys: Set<string>;
        articleCount: number;
        activeTopicCount: number;
        lastScrapedAt: string | null;
        targetGrades: Set<number>;
        languages: Set<string>;
      }>();

      for (const t of topicRows) {
        const src = t.source || "unknown";
        if (!sourceMap.has(src)) {
          sourceMap.set(src, {
            topicKeys: new Set(),
            articleCount: 0,
            activeTopicCount: 0,
            lastScrapedAt: null,
            targetGrades: new Set(),
            languages: new Set(),
          });
        }
        const entry = sourceMap.get(src)!;
        entry.topicKeys.add(t.topic_key);
        if (t.status === "active") entry.activeTopicCount++;
        if (t.language) entry.languages.add(t.language);
        for (const g of t.target_grades ?? []) entry.targetGrades.add(g);
        if (t.created_at && (!entry.lastScrapedAt || t.created_at > entry.lastScrapedAt)) {
          entry.lastScrapedAt = t.created_at;
        }
      }

      for (const a of articleRows) {
        const src = a.source || "unknown";
        if (sourceMap.has(src)) {
          sourceMap.get(src)!.articleCount++;
        } else {
          sourceMap.set(src, {
            topicKeys: new Set(),
            articleCount: 1,
            activeTopicCount: 0,
            lastScrapedAt: null,
            targetGrades: new Set([a.grade_level]),
            languages: new Set([a.language ?? "unknown"]),
          });
        }
      }

      const result: SourceInfo[] = [];
      for (const [key, data] of sourceMap) {
        const def = SOURCE_DEFS[key];
        result.push({
          key,
          label: def?.label ?? key,
          description: def?.description ?? "未知来源",
          topicCount: data.topicKeys.size,
          articleCount: data.articleCount,
          activeTopicCount: data.activeTopicCount,
          lastScrapedAt: data.lastScrapedAt,
          targetGrades: [...data.targetGrades].sort((a, b) => a - b),
          languages: [...data.languages],
        });
      }

      // Sort: known sources first, by article count desc
      result.sort((a, b) => {
        const aKnown = SOURCE_DEFS[a.key] ? 0 : 1;
        const bKnown = SOURCE_DEFS[b.key] ? 0 : 1;
        if (aKnown !== bKnown) return aKnown - bKnown;
        return b.articleCount - a.articleCount;
      });

      setSources(result);
      setLoading(false);
    };

    fetchSources();
  }, [supabase]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-2xl">加载中...</div>
      </div>
    );
  }

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    const date = new Date(d);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffH = Math.floor(diffMs / 3600000);
    const diffD = Math.floor(diffH / 24);
    if (diffH < 1) return `${Math.floor(diffMs / 60000)} 分钟前`;
    if (diffH < 24) return `${diffH} 小时前`;
    if (diffD < 7) return `${diffD} 天前`;
    return date.toLocaleDateString("zh-CN");
  };

  const languageLabel = (lang: string) => lang === "zh" ? "中文" : lang === "en" ? "EN" : lang;

  return (
    <SettingsShell
      title="抓取源管理"
      description="查看各内容来源的话题储备和抓取状态。"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {sources.map((src) => (
          <Card key={src.key}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-forest-700">{src.label}</h3>
                <p className="text-ui-sm text-ink-500">{src.description}</p>
              </div>
              <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${
                src.activeTopicCount > 0
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-ink-100 text-ink-500"
              }`}>
                {src.activeTopicCount > 0 ? "活跃" : "无数据"}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-radius-md bg-ink-50 px-3 py-2 text-center">
                <div className="text-lg font-bold text-forest-700">{src.topicCount}</div>
                <div className="text-xs text-ink-500">话题数</div>
              </div>
              <div className="rounded-radius-md bg-ink-50 px-3 py-2 text-center">
                <div className="text-lg font-bold text-forest-700">{src.articleCount}</div>
                <div className="text-xs text-ink-500">文章数</div>
              </div>
            </div>

            <div className="mt-3 space-y-1.5 text-ui-sm text-ink-500">
              {src.lastScrapedAt && (
                <div className="flex justify-between">
                  <span>最近抓取</span>
                  <span className="text-ink-400">{formatDate(src.lastScrapedAt)}</span>
                </div>
              )}
              {src.languages.length > 0 && (
                <div className="flex justify-between">
                  <span>语言</span>
                  <span className="text-ink-400">{src.languages.map(languageLabel).join(", ")}</span>
                </div>
              )}
              {src.targetGrades.length > 0 && (
                <div className="flex justify-between">
                  <span>目标年级</span>
                  <span className="text-ink-400">
                    {src.targetGrades.length <= 4
                      ? src.targetGrades.map(g => `G${g}`).join(", ")
                      : `G${src.targetGrades[0]}-G${src.targetGrades[src.targetGrades.length - 1]}`}
                  </span>
                </div>
              )}
            </div>
          </Card>
        ))}

        {sources.length === 0 && (
          <div className="col-span-2 text-center py-8 text-ink-400">
            暂无抓取源数据。运行抓取脚本后此处将显示各平台统计。
          </div>
        )}
      </div>
    </SettingsShell>
  );
}
