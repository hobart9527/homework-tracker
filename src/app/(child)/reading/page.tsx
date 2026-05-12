"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ArticleCard } from "@/components/reading/ArticleCard";

interface Article {
  id: string;
  title: string;
  category: string;
  grade_level: number;
  difficulty: number;
  word_count: number;
  estimated_minutes: number;
  topic_key?: string;
  source?: string;
  cover_image_url?: string;
  language?: "zh" | "en";
  status?: string;
  isCompleted?: boolean;
  score?: number;
}

const ZH_CATEGORIES = [
  { key: "时事", label: "时事" },
  { key: "历史", label: "历史" },
  { key: "科学", label: "科学" },
  { key: "人物", label: "人物" },
  { key: "自然", label: "自然" },
  { key: "文化", label: "文化" },
  { key: "成语故事", label: "成语故事" },
  { key: "寓言", label: "寓言" },
];

const EN_CATEGORIES = [
  { key: "news", label: "News" },
  { key: "history", label: "History" },
  { key: "science", label: "Science" },
  { key: "biography", label: "Biography" },
  { key: "nature", label: "Nature" },
  { key: "culture", label: "Culture" },
];

// Helper to detect language from article content/title
function inferLanguage(article: Article): "zh" | "en" {
  if (article.language) return article.language;
  // If category is in English list, it's English
  if (["news", "history", "science", "biography", "nature", "culture"].includes(article.category)) {
    return "en";
  }
  // If title/content has mostly ASCII, it's English
  const text = article.title || "";
  if (text.length === 0) return "zh";
  const asciiRatio = text.replace(/[^\x00-\x7F]/g, "").length / text.length;
  return asciiRatio > 0.7 ? "en" : "zh";
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl bg-white shadow-elevation-raised ring-1 ring-cream-200/40 overflow-hidden">
      <div className="aspect-[3/2] w-full bg-ink-100" />
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-5 w-14 rounded-full bg-ink-100" />
          <div className="h-5 w-8 rounded-full bg-ink-100" />
        </div>
        <div className="h-5 w-3/4 rounded bg-ink-100 mb-2" />
        <div className="h-5 w-1/2 rounded bg-ink-100 mb-3" />
        <div className="flex gap-3">
          <div className="h-3 w-16 rounded bg-ink-100" />
          <div className="h-3 w-16 rounded bg-ink-100" />
          <div className="h-3 w-20 rounded bg-ink-100" />
        </div>
      </div>
    </div>
  );
}

export default function ReadingBrowserPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [articles, setArticles] = useState<Article[]>([]);
  const [activeCategory, setActiveCategory] = useState("");
  const [activeLanguage, setActiveLanguage] = useState<"zh" | "en">("en");
  const [sortNewFirst, setSortNewFirst] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchReadingData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/child-login");
        return;
      }

      const childId = session.user.id;

      // Fetch articles and assignments in parallel
      const [articlesRes, assignmentsRes] = await Promise.all([
        fetch("/api/reading/articles"),
        supabase
          .from("reading_assignments")
          .select("article_id, status, score")
          .eq("child_id", childId),
      ]);

      if (!articlesRes.ok) {
        throw new Error("获取文章列表失败");
      }

      const articlesData = await articlesRes.json();
      const fetchedArticles = articlesData.articles || [];

      // Create a map of article_id -> {status, score}
      const assignmentMap: Record<string, { status: string; score: number }> = {};
      if (assignmentsRes.data) {
        for (const a of assignmentsRes.data) {
          assignmentMap[a.article_id] = { status: a.status, score: a.score };
        }
      }

      // Enrich articles with status, isNew, isInProgress flags
      const enrichedArticles = fetchedArticles.map((article: Article) => {
        const assignment = assignmentMap[article.id];
        const status = assignment?.status;
        return {
          ...article,
          status,
          isCompleted: status === "completed",
          isNew: !status || status === "recommended",
          isInProgress: status === "in_progress",
          score: assignment?.score,
        };
      });

      setArticles(enrichedArticles);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [router, supabase]);

  useEffect(() => {
    void fetchReadingData();
  }, [fetchReadingData]);

  // Get categories based on selected language
  const categoriesForLanguage =
    activeLanguage === "zh" ? ZH_CATEGORIES : EN_CATEGORIES;

  const filteredArticles = articles
    .filter((a) => {
      const lang = inferLanguage(a);
      const langMatch = lang === activeLanguage;
      const categoryMatch = !activeCategory || a.category === activeCategory;
      const searchMatch = !searchQuery || a.title.toLowerCase().includes(searchQuery.toLowerCase());
      return langMatch && categoryMatch && searchMatch;
    })
    .sort((a, b) => {
      if (sortNewFirst) {
        const aOrder = a.isCompleted ? 2 : (a as any).isInProgress ? 1 : 0;
        const bOrder = b.isCompleted ? 2 : (b as any).isInProgress ? 1 : 0;
        return aOrder - bOrder;
      }
      return 0;
    });

  // --- Error state ---
  if (error) {
    return (
      <main className="min-h-screen bg-cream-50 p-4 pb-24">
        <div
          role="alert"
          className="mx-auto flex min-h-[70vh] max-w-2xl items-center justify-center rounded-2xl bg-white/90 p-6 text-center shadow-elevation-modal ring-1 ring-cream-200/40"
        >
          <div>
            <div className="text-2xl font-bold text-forest-700 mb-2">加载失败</div>
            <p className="text-sm text-ink-500 mb-4">{error}</p>
            <button
              type="button"
              onClick={() => void fetchReadingData()}
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-elevation-raised transition hover:bg-primary-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              重试
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-cream-50 p-4 pb-24 text-forest-700">
      <div className="mx-auto max-w-6xl">
        {/* Page heading */}
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-forest-800">阅读专区</h1>
          <p className="mt-1 text-sm text-ink-500">探索有趣的文章，拓展知识视野</p>
        </div>

        {/* --- Language toggle - PRIMARY --- */}
        <div className="mb-4">
          <div className="inline-flex rounded-xl bg-white shadow-elevation-raised ring-1 ring-cream-200/40 p-1">
            <button
              onClick={() => {
                setActiveLanguage("en");
                setActiveCategory("");
              }}
              className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${
                activeLanguage === "en"
                  ? "bg-primary text-white shadow-sm"
                  : "text-ink-600 hover:bg-cream-50"
              }`}
            >
              English
            </button>
            <button
              onClick={() => {
                setActiveLanguage("zh");
                setActiveCategory("");
              }}
              className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${
                activeLanguage === "zh"
                  ? "bg-primary text-white shadow-sm"
                  : "text-ink-600 hover:bg-cream-50"
              }`}
            >
              中文
            </button>
          </div>
        </div>

        {/* --- Category pills - SECONDARY --- */}
        <div className="mb-6 flex flex-wrap gap-2">
          {categoriesForLanguage.map((cat) => (
            <button
              key={cat.key}
              onClick={() =>
                setActiveCategory(cat.key === activeCategory ? "" : cat.key)
              }
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                activeCategory === cat.key
                  ? "bg-forest-100 text-forest-700 ring-1 ring-forest-200"
                  : "bg-cream-100 text-ink-500 hover:bg-cream-200"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Sort & Search */}
        <div className="mb-5 flex items-center gap-3">
          <button
            onClick={() => setSortNewFirst(!sortNewFirst)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              sortNewFirst
                ? "bg-coral-100 text-coral-700 ring-1 ring-coral-200"
                : "bg-cream-100 text-ink-500 hover:bg-cream-200"
            }`}
          >
            {sortNewFirst ? "🆕 未读优先" : "📋 默认排序"}
          </button>
          <div className="relative flex-1 max-w-sm ml-auto">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索文章标题..."
              className="w-full pl-9 pr-4 py-2 rounded-lg bg-white text-sm border border-cream-200 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
            </svg>
          </div>
        </div>

        {/* --- Article grid --- */}
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : filteredArticles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="text-5xl mb-4 opacity-40">📚</div>
            <p className="text-lg font-medium text-ink-600">
              {activeLanguage === "en" ? "No English articles yet" : "暂无中文文章"}
            </p>
            <p className="mt-1 text-sm text-ink-400">
              {activeLanguage === "en"
                ? "Switch to 中文 to see Chinese articles"
                : "切换到 English to see English articles"
              }
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredArticles.map((article) => (
              <ArticleCard
                key={article.id}
                id={article.id}
                title={article.title}
                gradeLevel={article.grade_level}
                category={article.category}
                difficulty={article.difficulty}
                wordCount={article.word_count}
                estimatedMinutes={article.estimated_minutes}
                coverImageUrl={article.cover_image_url}
                language={article.language}
                isCompleted={article.isCompleted}
                isInProgress={(article as any).isInProgress}
                score={article.score}
                onClick={() => router.push(`/reading/${article.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
