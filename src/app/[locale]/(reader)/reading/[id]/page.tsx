"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { ArticleReader } from "@/components/reading/ArticleReader";
import type { ArticleReaderArticle, ArticleReaderRef } from "@/components/reading/ArticleReader";
import { ReadAlong } from "@/components/reading/ReadAlong";
import { QuizView } from "@/components/reading/QuizView";
import type { QuizViewQuestion } from "@/components/reading/QuizView";
import { useTranslation } from "@/hooks/useTranslation";
import {
  shouldAutoCompleteReading,
  createReadingAutoCheckin,
} from "@/lib/auto-checkins";

interface ApiArticle {
  id: string;
  title: string;
  content: string;
  grade_level: number;
  category: string;
  word_count: number;
  estimated_minutes: number;
  cover_image_url?: string;
  pinyin_content?: string;
  classical_quote?: {
    original: string;
    pinyin: string;
    translation: string;
  };
  language?: "zh" | "en";
  scene_description?: string;
  audio_zh_url?: string | null;
  audio_zh_voice?: string | null;
}

interface ApiQuestion {
  id: string;
  question_text: string;
  question_type: string;
  options: Array<{ label: string; text: string }>;
  difficulty: number;
}

interface ApiIllustration {
  paragraph_index: number;
  image_url: string;
  scene_description?: string;
}

interface FetchResult {
  article: ApiArticle;
  questions: ApiQuestion[];
  illustrations: ApiIllustration[];
}

function ReadingArticleContent({
  params,
}: {
  params: { id: string };
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const assignmentId = searchParams?.get("assignmentId") ?? null;

  const [article, setArticle] = useState<ArticleReaderArticle | null>(null);
  const [audioInfo, setAudioInfo] = useState<{
    url: string | null;
    voice: string | null;
  }>({ url: null, voice: null });
  const [questions, setQuestions] = useState<QuizViewQuestion[]>([]);
  const [childId, setChildId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"reading" | "quiz">("reading");
  const [pinyinEnabled, setPinyinEnabled] = useState(false);
  const [checkinStatus, setCheckinStatus] = useState<"pending" | "success" | "failed" | null>(null);

  const articleReaderRef = useRef<ArticleReaderRef>(null);
  const supabaseRef = useRef(createClient());
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const [ttsPaused, setTtsPaused] = useState(false);

  // Poll TTS state from ArticleReader ref
  useEffect(() => {
    const interval = setInterval(() => {
      if (articleReaderRef.current) {
        setTtsPlaying(articleReaderRef.current.isPlaying);
        setTtsPaused(articleReaderRef.current.isPaused);
      }
    }, 200);
    return () => clearInterval(interval);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push(`/${locale}/child-login`);
        return;
      }

      setChildId(session.user.id);

      // Fetch child's pinyin preference
      const { data: childProfile } = await supabase
        .from("children")
        .select("pinyin_enabled")
        .eq("id", session.user.id)
        .single();
      setPinyinEnabled(childProfile?.pinyin_enabled ?? false);

      const response = await fetch(`/api/reading/articles/${params.id}`);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(t('reading.article.notFound'));
        }
        throw new Error(t('reading.article.loadFailed'));
      }

      const data: FetchResult = await response.json();

      setArticle({
        id: data.article.id,
        title: data.article.title,
        content: data.article.content,
        gradeLevel: data.article.grade_level,
        category: data.article.category,
        wordCount: data.article.word_count,
        estimatedMinutes: data.article.estimated_minutes,
        coverImageUrl: data.article.cover_image_url,
        pinyinContent: data.article.pinyin_content,
        classicalQuote: data.article.classical_quote,
        language: data.article.language,
        illustrations: data.illustrations,
      });

      setAudioInfo({
        url: data.article.audio_zh_url ?? null,
        voice: data.article.audio_zh_voice ?? null,
      });

      setQuestions(data.questions || []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('reading.article.loadFailed')
      );
    } finally {
      setLoading(false);
    }
  }, [params.id, router]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleQuizComplete = useCallback(
    async (result: { score: number; total: number; pointsEarned: number }) => {
      window.dispatchEvent(new CustomEvent("child-points-changed"));

      // ── Reading auto-checkin ──
      if (!childId) return;

      setCheckinStatus("pending");
      try {
        const supabase = createClient();

        // Step 1: find all homeworks for this child that
        // belong to 中文 or 英文 primary category.
        // We filter by shouldAutoCompleteReading and group name in JS.
        const { data: readingHomeworks } = await supabase
          .from("homeworks")
          .select(
            "id, type_name, point_value, required_checkpoint_type, type_group_id, group:homework_type_groups(name)"
          )
          .eq("child_id", childId);

        const targetGroupName = article?.language === "en" ? "英文" : "中文";
        const matchingHomeworks =
          readingHomeworks?.filter(
            (hw: any) =>
              shouldAutoCompleteReading(hw) &&
              (hw.group?.name === targetGroupName ||
                // Fallback: type_name itself encodes language
                (article?.language === "en" && hw.type_name === "英文阅读") ||
                (article?.language === "zh" && hw.type_name === "中文阅读"))
          ) ?? [];

        for (const hw of matchingHomeworks) {
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          const todayEnd = new Date();
          todayEnd.setHours(23, 59, 59, 999);

          const { data: existingCheckIns } = await supabase
            .from("check_ins")
            .select("id, note")
            .eq("homework_id", hw.id)
            .gte("completed_at", todayStart.toISOString())
            .lte("completed_at", todayEnd.toISOString());

          const articleRef = `文章: ${params.id}`;
          const sameArticleCheckIn = existingCheckIns?.find(
            (ci) => ci.note?.includes(articleRef)
          );

          const noteLine = `${targetGroupName}阅读自动打卡 — 文章: ${params.id}, 得分: ${result.score}/${result.total}`;

          if (sameArticleCheckIn) {
            // Same article re-read → update score line
            await supabase
              .from("check_ins")
              .update({ note: noteLine })
              .eq("id", sameArticleCheckIn.id);
          } else {
            await createReadingAutoCheckin({
              supabase,
              childId,
              homework: {
                id: hw.id,
                point_value: hw.point_value ?? 0,
              },
              articleId: params.id,
              score: result.score,
              total: result.total,
              articleLanguage: article?.language,
            });
          }
        }
        setCheckinStatus("success");
      } catch (err) {
        // Auto-checkin is best-effort; never block the quiz flow.
        console.error("Reading auto-checkin failed:", err);
        setCheckinStatus("failed");
      }
    },
    [childId, params.id, article?.language]
  );

  // ── Loading state ──
  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Back button skeleton */}
        <div
          className="h-5 w-16 animate-pulse rounded-full"
          style={{ backgroundColor: "var(--reader-text-muted)", opacity: 0.3 }}
        />

        {/* Title skeleton */}
        <div className="space-y-3">
          <div
            className="h-8 w-3/4 animate-pulse rounded-lg"
            style={{ backgroundColor: "var(--reader-text-muted)", opacity: 0.25 }}
          />
          <div className="flex gap-2">
            <div
              className="h-6 w-16 animate-pulse rounded-full"
              style={{ backgroundColor: "var(--reader-text-muted)", opacity: 0.2 }}
            />
            <div
              className="h-6 w-12 animate-pulse rounded-full"
              style={{ backgroundColor: "var(--reader-text-muted)", opacity: 0.2 }}
            />
            <div
              className="h-6 w-36 animate-pulse rounded-full"
              style={{ backgroundColor: "var(--reader-text-muted)", opacity: 0.2 }}
            />
          </div>
        </div>

        {/* Content skeleton */}
        <div
          className="space-y-4 rounded-2xl p-6 shadow-sm"
          style={{
            backgroundColor: "var(--reader-surface)",
            border: "1px solid var(--reader-border)",
          }}
        >
          <div
            className="h-4 w-full animate-pulse rounded"
            style={{ backgroundColor: "var(--reader-text-muted)", opacity: 0.15 }}
          />
          <div
            className="h-4 w-5/6 animate-pulse rounded"
            style={{ backgroundColor: "var(--reader-text-muted)", opacity: 0.15 }}
          />
          <div
            className="h-4 w-4/5 animate-pulse rounded"
            style={{ backgroundColor: "var(--reader-text-muted)", opacity: 0.15 }}
          />
          <div
            className="h-4 w-full animate-pulse rounded"
            style={{ backgroundColor: "var(--reader-text-muted)", opacity: 0.15 }}
          />
          <div
            className="h-4 w-3/4 animate-pulse rounded"
            style={{ backgroundColor: "var(--reader-text-muted)", opacity: 0.15 }}
          />
          <div
            className="h-4 w-2/3 animate-pulse rounded"
            style={{ backgroundColor: "var(--reader-text-muted)", opacity: 0.15 }}
          />
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-4">
        <div className="text-center">
          <p className="text-lg font-medium" style={{ color: "var(--reader-text)" }}>
            {error}
          </p>
          <button
            type="button"
            onClick={() => router.back()}
            className="mt-4 rounded-full px-6 py-3 text-base font-medium transition"
            style={{
              backgroundColor: "var(--reader-surface)",
              color: "var(--reader-text)",
              border: "1px solid var(--reader-border)",
            }}
          >
            {t('reading.article.back')}
          </button>
        </div>
      </div>
    );
  }

  // ── Empty state (no article data after loading) ──
  if (!article) {
    return null;
  }

  return (
    <>
      {/* Phase 1: Article reading */}
      {phase === "reading" && (
        <>
          {article.language === "zh" && audioInfo.url ? (
            <div className="mx-auto max-w-2xl px-4 pt-4">
              <ReadAlong
                audioUrl={audioInfo.url}
                voice={audioInfo.voice ?? undefined}
              />
            </div>
          ) : null}
          <ArticleReader
            ref={articleReaderRef}
            article={article}
            pinyinEnabled={pinyinEnabled}
            onTogglePinyin={async () => {
              const newVal = !pinyinEnabled;
              await supabaseRef.current
                .from("children")
                .update({ pinyin_enabled: newVal })
                .eq("id", childId!);
              setPinyinEnabled(newVal);
            }}
            onStartQuiz={() => {
              setPhase("quiz");
            }}
          />
        </>
      )}

      {/* Phase 2: Quiz */}
      {phase === "quiz" && childId && (
        <div className="mx-auto max-w-2xl px-4 py-6">
          <QuizView
            questions={questions}
            articleId={params.id}
            childId={childId}
            assignmentId={assignmentId}
            onComplete={(result) => {
              handleQuizComplete(result).catch((e) =>
                console.error("handleQuizComplete error:", e)
              );
            }}
          />
        </div>
      )}

      {/* Auto-checkin status feedback */}
      {checkinStatus === "success" && (
        <div className="mx-auto max-w-2xl px-4 pb-6">
          <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium"
            style={{
              backgroundColor: "var(--color-success-bg, #ecfdf5)",
              color: "var(--color-success-text, #065f46)",
              border: "1px solid var(--color-success-border, #a7f3d0)",
            }}>
            <svg className="h-4 w-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            {t('reading.checkin.success')}
          </div>
        </div>
      )}

      {checkinStatus === "failed" && (
        <div className="mx-auto max-w-2xl px-4 pb-6">
          <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium"
            style={{
              backgroundColor: "var(--color-warning-bg, #fffbeb)",
              color: "var(--color-warning-text, #92400e)",
              border: "1px solid var(--color-warning-border, #fde68a)",
            }}>
            <svg className="h-4 w-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {t('reading.checkin.failed')}
          </div>
        </div>
      )}
    </>
  );
}

export default function ReadingArticlePage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <Suspense fallback={
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="h-5 w-16 animate-pulse rounded-full" style={{ backgroundColor: "var(--reader-text-muted)", opacity: 0.3 }} />
        <div className="space-y-3">
          <div className="h-8 w-3/4 animate-pulse rounded-lg" style={{ backgroundColor: "var(--reader-text-muted)", opacity: 0.25 }} />
          <div className="flex gap-2">
            <div className="h-6 w-16 animate-pulse rounded-full" style={{ backgroundColor: "var(--reader-text-muted)", opacity: 0.2 }} />
            <div className="h-6 w-12 animate-pulse rounded-full" style={{ backgroundColor: "var(--reader-text-muted)", opacity: 0.2 }} />
            <div className="h-6 w-36 animate-pulse rounded-full" style={{ backgroundColor: "var(--reader-text-muted)", opacity: 0.2 }} />
          </div>
        </div>
        <div className="space-y-4 rounded-2xl p-6 shadow-sm" style={{ backgroundColor: "var(--reader-surface)", border: "1px solid var(--reader-border)" }}>
          <div className="h-4 w-full animate-pulse rounded" style={{ backgroundColor: "var(--reader-text-muted)", opacity: 0.15 }} />
          <div className="h-4 w-5/6 animate-pulse rounded" style={{ backgroundColor: "var(--reader-text-muted)", opacity: 0.15 }} />
          <div className="h-4 w-4/5 animate-pulse rounded" style={{ backgroundColor: "var(--reader-text-muted)", opacity: 0.15 }} />
          <div className="h-4 w-full animate-pulse rounded" style={{ backgroundColor: "var(--reader-text-muted)", opacity: 0.15 }} />
          <div className="h-4 w-3/4 animate-pulse rounded" style={{ backgroundColor: "var(--reader-text-muted)", opacity: 0.15 }} />
          <div className="h-4 w-2/3 animate-pulse rounded" style={{ backgroundColor: "var(--reader-text-muted)", opacity: 0.15 }} />
        </div>
      </div>
    }>
      <ReadingArticleContent params={params} />
    </Suspense>
  );
}
