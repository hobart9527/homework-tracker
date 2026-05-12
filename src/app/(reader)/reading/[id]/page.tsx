"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ArticleReader } from "@/components/reading/ArticleReader";
import type { ArticleReaderArticle, ArticleReaderRef } from "@/components/reading/ArticleReader";
import { ReadAlong } from "@/components/reading/ReadAlong";
import { QuizView } from "@/components/reading/QuizView";
import type { QuizViewQuestion } from "@/components/reading/QuizView";
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

export default function ReadingArticlePage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
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

  const articleReaderRef = useRef<ArticleReaderRef>(null);
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
        router.push("/child-login");
        return;
      }

      setChildId(session.user.id);

      const response = await fetch(`/api/reading/articles/${params.id}`);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("文章未找到");
        }
        throw new Error("加载失败");
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
        err instanceof Error ? err.message : "加载失败"
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
      if (assignmentId) {
        try {
          const supabase = createClient();

          // Step 1: fetch the assignment with homework linkage.
          // reading_assignments has no homework_id FK, so we join via
          // the child_id + matching reading-type homework.
          const { data: assignment } = await supabase
            .from("reading_assignments")
            .select("id, child_id")
            .eq("id", assignmentId)
            .single();

          if (assignment) {
            // Step 2: find a reading homework for this child that
            // qualifies for auto-completion (type is 阅读/英文阅读 AND
            // no recording required).
            const { data: readingHomeworks } = await supabase
              .from("homeworks")
              .select("id, type_name, point_value, required_checkpoint_type")
              .eq("child_id", assignment.child_id)
              .is("deleted_at", null)
              .in("type_name", ["阅读", "英文阅读"]);

            if (readingHomeworks && readingHomeworks.length > 0) {
              const qualifyingHomework = readingHomeworks.find((hw) =>
                shouldAutoCompleteReading(hw)
              );

              if (qualifyingHomework) {
                // Guard: skip if a check-in already exists for this
                // homework today (server-side quiz submit may have
                // linked its check-in to this homework already).
                const todayStart = new Date();
                todayStart.setHours(0, 0, 0, 0);
                const todayEnd = new Date();
                todayEnd.setHours(23, 59, 59, 999);
                const { data: existingCheckIns } = await supabase
                  .from("check_ins")
                  .select("id")
                  .eq("homework_id", qualifyingHomework.id)
                  .gte("completed_at", todayStart.toISOString())
                  .lte("completed_at", todayEnd.toISOString());

                if (!existingCheckIns || existingCheckIns.length === 0) {
                  await createReadingAutoCheckin({
                    supabase,
                    childId: assignment.child_id,
                    homework: {
                      id: qualifyingHomework.id,
                      point_value: qualifyingHomework.point_value ?? 0,
                    },
                    articleId: params.id,
                    score: result.score,
                    total: result.total,
                  });
                }
              }
            }
          }
        } catch (err) {
          // Auto-checkin is best-effort; never block the quiz flow.
          console.error("Reading auto-checkin failed:", err);
        }
      }
    },
    [assignmentId, params.id]
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
            {"← 返回"}
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
    </>
  );
}
