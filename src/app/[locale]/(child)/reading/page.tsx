"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { ArticleCard } from "@/components/reading/ArticleCard";
import { IconBook } from "@/components/ui/icons";
import { useTranslation } from "@/hooks/useTranslation";

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
  created_at?: string;
  status?: string;
  isCompleted?: boolean;
  isInProgress?: boolean;
  score?: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  // English legacy + v2
  news: "News", current: "News",
  history: "History",
  science: "Science",
  biography: "Biography", 人物: "Biography",
  nature: "Nature", 自然生态: "Nature",
  culture: "Culture", 文化: "Culture",
  stories: "Stories", 故事: "Stories",
  // Chinese categories
  时事: "时事", 历史: "历史", 科学: "科学",
  自然: "自然", 成语故事: "成语故事", 寓言: "寓言",
  中国史: "中国史", 美国史: "美国史", 世界史: "世界史",
  文学: "文学", 诗歌: "诗歌", 艺术: "艺术",
  "经济与生活": "经济与生活", "数码与AI": "数码与AI",
  "太空与天文": "太空与天文", 医学健康: "医学健康",
  体育: "体育", 环保: "环保",
};

const FALLBACK_EN_CATEGORIES = [
  { key: "news", label: "News" },
  { key: "history", label: "History" },
  { key: "science", label: "Science" },
  { key: "biography", label: "Biography" },
  { key: "nature", label: "Nature" },
  { key: "culture", label: "Culture" },
  { key: "stories", label: "Stories" },
];

// Helper to detect language from article content/title
function inferLanguage(article: Article): "zh" | "en" {
  if (article.language) return article.language;
  // If category is in English list (legacy + v2), it's English
  if (["news", "current", "history", "science", "biography", "nature", "culture", "stories"].includes(article.category)) {
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
      <div className="aspect-[16/9] w-full bg-ink-100" />
      <div className="p-3">
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
  const { t } = useTranslation();
  const router = useRouter();
  const locale = useLocale();
  const [supabase] = useState(() => createClient());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [articles, setArticles] = useState<Article[]>([]);
  const [activeCategory, setActiveCategory] = useState("");
  const [activeLanguage, setActiveLanguage] = useState<"zh" | "en">("en");
  const [sortMode, setSortMode] = useState<"default" | "unread" | "latest">("default");
  const [searchQuery, setSearchQuery] = useState("");
  const [userGradeLevel, setUserGradeLevel] = useState<number | null>(null);
  const [gradeFilter, setGradeFilter] = useState<"suitable" | "challenge" | "all">("suitable");

  const fetchReadingData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push(`/${locale}/child-login`);
        return;
      }

      const childId = session.user.id;

      // Fetch child's reading grade level
      const { data: childProfile } = await supabase
        .from("children")
        .select("reading_grade_level")
        .eq("id", childId)
        .single();
      setUserGradeLevel(childProfile?.reading_grade_level ?? null);

      // Fetch articles and assignments in parallel
      const [articlesRes, assignmentsRes] = await Promise.all([
        fetch("/api/reading/articles"),
        supabase
          .from("reading_assignments")
          .select("article_id, status, score")
          .eq("child_id", childId),
      ]);

      if (!articlesRes.ok) {
        throw new Error(t('reading.browser.loadError'));
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
      setError(err instanceof Error ? err.message : t('reading.browser.loadGenericError'));
    } finally {
      setLoading(false);
    }
  }, [router, supabase]);

  useEffect(() => {
    void fetchReadingData();
  }, [fetchReadingData]);

  // Derive available categories dynamically from articles matching active language
  const availableCategories = useMemo(() => {
    const lang = activeLanguage;
    const cats = new Set<string>();
    for (const a of articles) {
      const articleLang = inferLanguage(a);
      if (articleLang === lang && a.category) {
        cats.add(a.category);
      }
    }
    const entries = Array.from(cats).sort().map(key => ({
      key,
      label: CATEGORY_LABELS[key] || key,
    }));
    // Fallback for empty state (no articles loaded yet)
    return entries.length > 0 ? entries : (activeLanguage === "en" ? FALLBACK_EN_CATEGORIES : []);
  }, [articles, activeLanguage]);

  const filteredArticles = articles
    .filter((a) => {
      const lang = inferLanguage(a);
      const langMatch = lang === activeLanguage;
      const categoryMatch = !activeCategory || a.category === activeCategory;
      const searchMatch = !searchQuery || a.title.toLowerCase().includes(searchQuery.toLowerCase());
      const gradeMatch = (() => {
        if (!userGradeLevel || gradeFilter === "all") return true;
        if (gradeFilter === "challenge") return a.grade_level > userGradeLevel + 1;
        // "suitable" — default
        return Math.abs(a.grade_level - userGradeLevel) <= 1;
      })();
      return langMatch && categoryMatch && searchMatch && gradeMatch;
    })
    .sort((a, b) => {
      switch (sortMode) {
        case "unread": {
          const aOrder = a.isCompleted ? 2 : a.isInProgress ? 1 : 0;
          const bOrder = b.isCompleted ? 2 : b.isInProgress ? 1 : 0;
          return aOrder - bOrder;
        }
        case "latest": {
          const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
          const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
          return bTime - aTime;
        }
        default:
          return b.created_at && a.created_at
            ? new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            : 0;
      }
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
            <div className="text-2xl font-bold text-forest-700 mb-2">{t('reading.browser.loadGenericError')}</div>
            <p className="text-sm text-ink-500 mb-4">{error}</p>
            <button
              type="button"
              onClick={() => void fetchReadingData()}
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-elevation-raised transition hover:bg-primary-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {t('common.retry')}
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
          <h1 className="text-2xl font-bold text-forest-800">{t('reading.browser.title')}</h1>
          <p className="mt-1 text-sm text-ink-500">{t('reading.browser.subtitle')}</p>
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

        {/* Grade filter */}
        {userGradeLevel !== null && (
          <div className="mb-4">
            <div className="inline-flex rounded-xl bg-white shadow-elevation-raised ring-1 ring-cream-200/40 p-1">
              <button
                onClick={() => setGradeFilter("suitable")}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  gradeFilter === "suitable"
                    ? "bg-forest-100 text-forest-700 ring-1 ring-forest-200"
                    : "text-ink-600 hover:bg-cream-50"
                }`}
              >
                适合我 (G{userGradeLevel})
              </button>
              <button
                onClick={() => setGradeFilter("challenge")}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  gradeFilter === "challenge"
                    ? "bg-coral-100 text-coral-700 ring-1 ring-coral-200"
                    : "text-ink-600 hover:bg-cream-50"
                }`}
              >
                挑战
              </button>
              <button
                onClick={() => setGradeFilter("all")}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  gradeFilter === "all"
                    ? "bg-cream-200 text-ink-700"
                    : "text-ink-600 hover:bg-cream-50"
                }`}
              >
                全部
              </button>
            </div>
          </div>
        )}

        {/* --- Category pills - SECONDARY --- */}
        <div className="mb-6 flex flex-wrap gap-2">
          {availableCategories.map((cat) => (
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
          <div className="inline-flex rounded-xl bg-white shadow-elevation-raised ring-1 ring-cream-200/40 p-1">
            <button
              onClick={() => setSortMode("default")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                sortMode === "default"
                  ? "bg-coral-100 text-coral-700 ring-1 ring-coral-200"
                  : "text-ink-600 hover:bg-cream-50"
              }`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 inline-block mr-1"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>{" "}
              {t('reading.browser.sortDefault')}
            </button>
            <button
              onClick={() => setSortMode("unread")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                sortMode === "unread"
                  ? "bg-coral-100 text-coral-700 ring-1 ring-coral-200"
                  : "text-ink-600 hover:bg-cream-50"
              }`}
            >
              <IconBook className="w-4 h-4 inline-block mr-1" /> {t('reading.browser.sortUnread')}
            </button>
            <button
              onClick={() => setSortMode("latest")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                sortMode === "latest"
                  ? "bg-coral-100 text-coral-700 ring-1 ring-coral-200"
                  : "text-ink-600 hover:bg-cream-50"
              }`}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 inline-block mr-1"><path d="M12 2c-1.5 3-4 5-5 8-1 3 0 6 2 8 1 1 2 2 3 2s2-1 3-2c2-2 3-5 2-8-1-3-3.5-5-5-8z" /></svg>{" "}
              {t('reading.browser.sortLatest')}
            </button>
          </div>
          <div className="relative flex-1 max-w-sm">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('reading.browser.searchPlaceholder')}
              className="w-full pl-9 pr-4 py-2 rounded-lg bg-white text-sm border border-cream-200 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
            </svg>
          </div>
        </div>

        {/* --- Article grid --- */}
        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : filteredArticles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="text-5xl mb-4 opacity-40">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-14 h-14 mx-auto">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </div>
            <p className="text-lg font-medium text-ink-600">
              {activeLanguage === "en" ? t('reading.browser.enEmpty') : t('reading.browser.zhEmpty')}
            </p>
            <p className="mt-1 text-sm text-ink-400">
              {activeLanguage === "en"
                ? t('reading.browser.switchHintEn')
                : t('reading.browser.switchHintZh')
              }
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
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
                isInProgress={article.isInProgress}
                score={article.score}
                onClick={() => router.push(`/${locale}/reading/${article.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
