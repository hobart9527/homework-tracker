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
}

const CATEGORIES = [
  { key: "all", label: "全部" },
  { key: "时事", label: "时事" },
  { key: "历史", label: "历史" },
  { key: "科学", label: "科学" },
  { key: "人物", label: "人物" },
  { key: "自然", label: "自然" },
  { key: "文化", label: "文化" },
];

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-2xl bg-white shadow-sm ring-1 ring-forest-100 p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-5 w-14 rounded-full bg-gray-200" />
        <div className="h-5 w-8 rounded-full bg-gray-200" />
      </div>
      <div className="h-5 w-3/4 rounded bg-gray-200 mb-2" />
      <div className="h-5 w-1/2 rounded bg-gray-200 mb-3" />
      <div className="flex gap-3">
        <div className="h-3 w-16 rounded bg-gray-200" />
        <div className="h-3 w-16 rounded bg-gray-200" />
        <div className="h-3 w-20 rounded bg-gray-200" />
      </div>
    </div>
  );
}

export default function ReadingBrowserPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [recommendedArticle, setRecommendedArticle] = useState<Article | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [activeCategory, setActiveCategory] = useState("all");

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

      // Fetch recommendation and articles in parallel
      const [recommendRes, articlesRes] = await Promise.all([
        fetch(`/api/reading/recommend?childId=${encodeURIComponent(childId)}`),
        fetch("/api/reading/articles"),
      ]);

      if (!recommendRes.ok) {
        console.error("Recommend API error:", await recommendRes.text());
      } else {
        const recommendData = await recommendRes.json();
        setRecommendedArticle(recommendData.article || null);
      }

      if (!articlesRes.ok) {
        throw new Error("获取文章列表失败");
      }

      const articlesData = await articlesRes.json();
      setArticles(articlesData.articles || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [router, supabase]);

  useEffect(() => {
    void fetchReadingData();
  }, [fetchReadingData]);

  const filteredArticles =
    activeCategory === "all"
      ? articles
      : articles.filter((a) => a.category === activeCategory);

  // --- Error state ---
  if (error) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-[#F6FBF8] via-[#FFF9F1] to-[#F5F8FF] p-4 pb-24">
        <div
          role="alert"
          className="mx-auto flex min-h-[70vh] max-w-2xl items-center justify-center rounded-[32px] bg-white/90 p-6 text-center shadow-lg ring-1 ring-forest-100"
        >
          <div>
            <div className="text-2xl font-bold text-forest-700 mb-2">加载失败</div>
            <p className="text-sm text-forest-500 mb-4">{error}</p>
            <button
              type="button"
              onClick={() => void fetchReadingData()}
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-primary-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              重试
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#F6FBF8] via-[#FFF9F1] to-[#F5F8FF] p-4 pb-24 text-forest-700">
      <div className="mx-auto max-w-6xl">
        {/* Page heading */}
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-forest-800">阅读专区</h1>
          <p className="mt-1 text-sm text-forest-500">探索有趣的文章，拓展知识视野</p>
        </div>

        {/* --- Hero: Today's recommendation --- */}
        <section className="mb-6">
          {loading ? (
            <div className="animate-pulse rounded-[32px] bg-gradient-to-br from-amber-50 to-orange-50 p-6 shadow-sm ring-1 ring-amber-100">
              <div className="h-4 w-24 rounded bg-gray-200 mb-3" />
              <div className="h-7 w-3/4 rounded bg-gray-200 mb-2" />
              <div className="h-4 w-1/2 rounded bg-gray-200 mb-4" />
              <div className="h-10 w-28 rounded-full bg-gray-200" />
            </div>
          ) : recommendedArticle ? (
            <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100 p-6 shadow-sm ring-1 ring-amber-200">
              <div className="absolute -top-6 -right-6 text-8xl opacity-10 select-none">
                📚
              </div>
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-3">
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-200/70 px-3 py-1 text-sm font-semibold text-amber-800">
                    🎯 今日推荐
                  </span>
                  {recommendedArticle.category && (
                    <span className="inline-block rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-forest-600 backdrop-blur">
                      {recommendedArticle.category}
                    </span>
                  )}
                </div>

                <h2 className="text-xl font-bold text-forest-800 sm:text-2xl line-clamp-2">
                  {recommendedArticle.title}
                </h2>

                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-forest-600">
                  <span className="inline-flex items-center gap-1">
                    📝 {recommendedArticle.word_count}字
                  </span>
                  <span className="inline-flex items-center gap-1">
                    ⏱️ {recommendedArticle.estimated_minutes}分钟
                  </span>
                  <span className="inline-flex items-center gap-1">
                    📖 G{recommendedArticle.grade_level}
                  </span>
                  <span className="inline-flex items-center gap-1" aria-label={`难度 ${recommendedArticle.difficulty}/5`}>
                    {Array.from({ length: 5 }, (_, i) => (
                      <span
                        key={i}
                        className={`text-sm ${i < Math.round(recommendedArticle.difficulty) ? "text-amber-400" : "text-gray-300"}`}
                      >
                        ★
                      </span>
                    ))}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => router.push(`/reading/${recommendedArticle.id}`)}
                  className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span>开始阅读</span>
                  <span>→</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-[32px] bg-gradient-to-br from-amber-50 to-orange-50 p-6 text-center shadow-sm ring-1 ring-amber-100">
              <div className="text-4xl mb-3">📖</div>
              <p className="text-base font-medium text-forest-700">
                还没有推荐文章，浏览下方文章库吧！
              </p>
            </div>
          )}
        </section>

        {/* --- Category filter --- */}
        <div className="mb-5 overflow-x-auto -mx-4 px-4">
          <div className="flex gap-2 min-w-max pb-1">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                type="button"
                onClick={() => setActiveCategory(cat.key)}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  activeCategory === cat.key
                    ? "bg-primary text-white shadow-sm"
                    : "bg-white text-forest-600 ring-1 ring-forest-200 hover:bg-forest-50"
                }`}
              >
                {cat.label}
              </button>
            ))}
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
          <div className="flex min-h-[40vh] items-center justify-center rounded-[32px] bg-white/80">
            <div className="text-center">
              <div className="text-5xl mb-4">📚</div>
              <p className="text-lg font-medium text-forest-600">暂无文章</p>
              <p className="mt-1 text-sm text-forest-400">
                {activeCategory !== "all"
                  ? "该分类暂时还没有文章"
                  : "文章库正在充实中，请稍后再来"}
              </p>
            </div>
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
                onClick={() => router.push(`/reading/${article.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
