"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ArticleReader } from "@/components/reading/ArticleReader";
import type { ArticleReaderArticle, ArticleReaderRef } from "@/components/reading/ArticleReader";
import { ReadAlong } from "@/components/reading/ReadAlong";
import { QuizView } from "@/components/reading/QuizView";
import type { QuizViewQuestion } from "@/components/reading/QuizView";

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

  const handleQuizComplete = useCallback(() => {
    window.dispatchEvent(new CustomEvent("child-points-changed"));
  }, []);

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
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* Phase 1: Article reading */}
      {phase === "reading" && (
        <>
          {article.language === "zh" && audioInfo.url ? (
            <ReadAlong
              audioUrl={audioInfo.url}
              voice={audioInfo.voice ?? undefined}
              className="mb-4"
            />
          ) : article.language === "zh" && !audioInfo.url ? (
            <div
              className="mb-4 rounded-md px-4 py-3 text-sm"
              style={{
                backgroundColor: "var(--reader-surface)",
                  color: "var(--reader-text-muted)",
                  border: "1px solid var(--reader-border)",
                }}
              >
                {"音频生成中…"}
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
        <QuizView
          questions={questions}
          articleId={params.id}
          childId={childId}
          assignmentId={assignmentId}
          onComplete={handleQuizComplete}
        />
      )}
    </div>
  );
}
