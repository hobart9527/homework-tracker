"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ArticleReader } from "@/components/reading/ArticleReader";
import type { ArticleReaderArticle } from "@/components/reading/ArticleReader";
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
}

interface ApiQuestion {
  id: string;
  question_text: string;
  question_type: string;
  options: Array<{ label: string; text: string }>;
  difficulty: number;
}

interface FetchResult {
  article: ApiArticle;
  questions: ApiQuestion[];
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
  const [questions, setQuestions] = useState<QuizViewQuestion[]>([]);
  const [childId, setChildId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"reading" | "quiz">("reading");

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
      <div className="min-h-screen bg-gradient-to-br from-[#F6FBF8] via-[#FFF9F1] to-[#F5F8FF] p-4">
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Back button skeleton */}
          <div className="h-5 w-16 animate-pulse rounded-full bg-forest-200" />

          {/* Title skeleton */}
          <div className="space-y-3">
            <div className="h-8 w-3/4 animate-pulse rounded-lg bg-forest-100" />
            <div className="flex gap-2">
              <div className="h-6 w-16 animate-pulse rounded-full bg-forest-100" />
              <div className="h-6 w-12 animate-pulse rounded-full bg-forest-100" />
              <div className="h-6 w-36 animate-pulse rounded-full bg-forest-100" />
            </div>
          </div>

          {/* Content skeleton */}
          <div className="space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-forest-100">
            <div className="h-4 w-full animate-pulse rounded bg-forest-50" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-forest-50" />
            <div className="h-4 w-4/5 animate-pulse rounded bg-forest-50" />
            <div className="h-4 w-full animate-pulse rounded bg-forest-50" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-forest-50" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-forest-50" />
          </div>
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 bg-gradient-to-br from-[#F6FBF8] via-[#FFF9F1] to-[#F5F8FF] p-4">
        <div className="text-center">
          <p className="text-lg font-medium text-forest-700">{error}</p>
          <button
            type="button"
            onClick={() => router.back()}
            className="mt-4 rounded-full bg-forest-100 px-6 py-3 text-base font-medium text-forest-700 transition hover:bg-forest-200"
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
    <div className="min-h-screen bg-gradient-to-br from-[#F6FBF8] via-[#FFF9F1] to-[#F5F8FF]">
      <div className="mx-auto max-w-2xl px-4 py-6">
        {/* Header with back button */}
        <div className="mb-6">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex items-center gap-1 text-sm font-medium text-forest-500 transition hover:text-forest-700"
          >
            {"← 返回"}
          </button>
        </div>

        {/* Phase 1: Article reading */}
        {phase === "reading" && (
          <ArticleReader
            article={article}
            onStartQuiz={() => {
              setPhase("quiz");
            }}
          />
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
    </div>
  );
}
