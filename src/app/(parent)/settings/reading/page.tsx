"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SettingsShell } from "@/components/parent/SettingsShell";
import { Card } from "@/components/ui/Card";
import type { Database } from "@/lib/supabase/types";

type Article = Database["public"]["Tables"]["reading_articles"]["Row"];
type Topic = Database["public"]["Tables"]["reading_topics"]["Row"];

interface DashboardStats {
  totalArticles: number;
  publishedArticles: number;
  draftArticles: number;
  totalTopics: number;
  activeTopics: number;
  staleTopics: number;
  byLanguage: Record<string, number>;
  byGrade: Record<number, number>;
  bySource: Record<string, number>;
  recentArticles: Pick<Article, "id" | "title" | "grade_level" | "language" | "status" | "source" | "created_at">[];
}

export default function ReadingDashboardPage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }

      const [{ data: articles }, { data: topics }] = await Promise.all([
        supabase.from("reading_articles").select("id,title,grade_level,language,status,source,created_at").order("created_at", { ascending: false }),
        supabase.from("reading_topics").select("topic_key,language,source,status,freshness_until,created_at"),
      ]);

      const articleRows = (articles ?? []) as Article[];
      const topicRows = (topics ?? []) as Topic[];

      const byLanguage: Record<string, number> = {};
      const byGrade: Record<number, number> = {};
      const bySource: Record<string, number> = {};
      let publishedArticles = 0;
      let draftArticles = 0;

      for (const a of articleRows) {
        const lang = a.language ?? "unknown";
        byLanguage[lang] = (byLanguage[lang] ?? 0) + 1;
        byGrade[a.grade_level] = (byGrade[a.grade_level] ?? 0) + 1;
        const src = a.source || "unknown";
        bySource[src] = (bySource[src] ?? 0) + 1;
        if (a.status === "published") publishedArticles++;
        else draftArticles++;
      }

      let activeTopics = 0;
      let staleTopics = 0;
      const now = new Date();
      for (const t of topicRows) {
        if (t.status !== "active") continue;
        activeTopics++;
        if (t.freshness_until && new Date(t.freshness_until) < now) {
          staleTopics++;
        }
      }

      setStats({
        totalArticles: articleRows.length,
        publishedArticles,
        draftArticles,
        totalTopics: topicRows.length,
        activeTopics,
        staleTopics,
        byLanguage,
        byGrade,
        bySource,
        recentArticles: articleRows.slice(0, 10),
      });

      setLoading(false);
    };

    fetchStats();
  }, [supabase]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-2xl">加载中...</div>
      </div>
    );
  }

  const sourceLabels: Record<string, string> = {
    dogo: "DOGO News",
    "news-in-levels": "News in Levels",
    commonlit: "CommonLit",
    icdl: "ICDL",
    gushiwen: "古诗文",
    "classic-corpus": "经典语料",
    parent_news: "家长投稿",
    manual: "手动录入",
    original: "AI 原创",
  };

  return (
    <SettingsShell
      title="阅读内容概览"
      description="文章库存、话题状态和近期生成历史。"
    >
      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <div className="text-center">
            <div className="text-3xl font-bold text-forest-700">{stats?.totalArticles ?? 0}</div>
            <div className="text-ui-sm text-ink-500">文章总数</div>
            <div className="mt-1 text-xs text-ink-400">
              {stats?.publishedArticles ?? 0} 已发布 / {stats?.draftArticles ?? 0} 草稿
            </div>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <div className="text-3xl font-bold text-forest-700">{stats?.activeTopics ?? 0}</div>
            <div className="text-ui-sm text-ink-500">活跃话题</div>
            <div className="mt-1 text-xs text-ink-400">
              {stats?.staleTopics ?? 0} 已过期
            </div>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <div className="text-3xl font-bold text-forest-700">{stats?.byLanguage["en"] ?? 0}</div>
            <div className="text-ui-sm text-ink-500">英文文章</div>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <div className="text-3xl font-bold text-forest-700">{stats?.byLanguage["zh"] ?? 0}</div>
            <div className="text-ui-sm text-ink-500">中文文章</div>
          </div>
        </Card>
      </div>

      {/* Grade distribution */}
      <Card>
        <h2 className="mb-3 font-bold text-forest-700">年级分布</h2>
        <div className="flex flex-wrap gap-2">
          {Object.entries(stats?.byGrade ?? {}).sort(([a], [b]) => Number(a) - Number(b)).map(([grade, count]) => (
            <div key={grade} className="flex items-center gap-1.5 rounded-radius-md bg-ink-50 px-3 py-1.5">
              <span className="text-ui-sm font-medium text-forest-700">G{grade}</span>
              <span className="text-ui-sm text-ink-500">{count}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Source distribution */}
      <Card>
        <h2 className="mb-3 font-bold text-forest-700">来源分布</h2>
        {stats && Object.keys(stats.bySource).length > 0 ? (
          <div className="space-y-2">
            {Object.entries(stats.bySource).sort(([, a], [, b]) => b - a).map(([source, count]) => (
              <div key={source} className="flex items-center justify-between rounded-radius-md bg-ink-50 px-3 py-2">
                <span className="text-ui-sm font-medium text-forest-700">
                  {sourceLabels[source] ?? source}
                </span>
                <span className="text-ui-sm text-ink-500">{count} 篇</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-ui-sm text-ink-400">暂无数据</p>
        )}
      </Card>

      {/* Recent articles */}
      <Card>
        <h2 className="mb-3 font-bold text-forest-700">最近生成</h2>
        {stats && stats.recentArticles.length > 0 ? (
          <div className="space-y-1">
            {stats.recentArticles.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-radius-md px-3 py-2 hover:bg-ink-50">
                <div className="min-w-0 flex-1">
                  <span className="text-ui-sm text-forest-700 truncate block">{a.title}</span>
                  <span className="text-xs text-ink-400">
                    {sourceLabels[a.source] ?? a.source ?? "unknown"} · G{a.grade_level} · {a.language === "zh" ? "中文" : "EN"}
                  </span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  a.status === "published" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                }`}>
                  {a.status === "published" ? "已发布" : "草稿"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-ui-sm text-ink-400">暂无文章</p>
        )}
      </Card>
    </SettingsShell>
  );
}
