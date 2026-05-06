"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

export interface QuizViewQuestion {
  id: string;
  question_text: string;
  question_type: string;
  options: Array<{ label: string; text: string }>;
  difficulty: number;
}

interface QuizViewProps {
  questions: QuizViewQuestion[];
  articleId: string;
  childId: string;
  assignmentId?: string | null;
  onComplete: (result: {
    score: number;
    total: number;
    pointsEarned: number;
    answers: Array<{
      questionId: string;
      selected: string;
      correct: boolean;
    }>;
  }) => void;
}

interface QuizResult {
  score: number;
  total: number;
  pointsEarned: number;
  answers: Array<{
    questionId: string;
    selected: string;
    correct: boolean;
  }>;
}

const typeLabels: Record<string, string> = {
  main_idea: "主旨题",
  detail: "细节题",
  inference: "推理题",
  vocabulary: "词汇题",
  sequence: "排序题",
};

export function QuizView({
  questions,
  articleId,
  childId,
  assignmentId,
  onComplete,
}: QuizViewProps) {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [phase, setPhase] = useState<"quiz" | "submitting" | "results">(
    "quiz"
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<QuizResult | null>(null);
  const startTimeRef = useRef(Date.now());
  const autoAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answersRef = useRef<Record<string, string>>({});

  useEffect(() => {
    return () => {
      if (autoAdvanceRef.current) {
        clearTimeout(autoAdvanceRef.current);
      }
    };
  }, []);

  const submitQuiz = useCallback(
    async (finalAnswers: Record<string, string>) => {
      setSubmitError(null);
      const timeSpentSeconds = Math.round(
        (Date.now() - startTimeRef.current) / 1000
      );

      try {
        const response = await fetch("/api/reading/quiz/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            childId,
            articleId,
            assignmentId: assignmentId || undefined,
            answers: Object.entries(finalAnswers).map(
              ([questionId, selectedLabel]) => ({
                questionId,
                selectedLabel,
              })
            ),
            timeSpentSeconds,
          }),
        });

        if (!response.ok) {
          throw new Error("提交失败");
        }

        const data = await response.json();
        const mappedResult: QuizResult = {
          score: data.score,
          total: data.total,
          pointsEarned: data.pointsEarned,
          answers: (data.answers || []).map(
            (a: {
              question_id: string;
              selected: string;
              correct: boolean;
            }) => ({
              questionId: a.question_id,
              selected: a.selected,
              correct: a.correct,
            })
          ),
        };
        setResult(mappedResult);
        setPhase("results");
        onComplete(mappedResult);
      } catch {
        setSubmitError("提交失败，请重试");
      }
    },
    [childId, articleId, assignmentId, onComplete]
  );

  const handleSelect = useCallback(
    (label: string) => {
      if (selectedLabel !== null) return;
      setSelectedLabel(label);

      const updatedAnswers = {
        ...answersRef.current,
        [questions[currentIndex].id]: label,
      };
      answersRef.current = updatedAnswers;

      autoAdvanceRef.current = setTimeout(() => {
        if (currentIndex < questions.length - 1) {
          setCurrentIndex((prev) => prev + 1);
          setSelectedLabel(null);
        } else {
          setPhase("submitting");
          submitQuiz(updatedAnswers);
        }
      }, 500);
    },
    [selectedLabel, questions, currentIndex, submitQuiz]
  );

  if (questions.length === 0) {
    return null;
  }

  // ── Results phase ──
  if (phase === "results" && result) {
    const percentage = (result.score / result.total) * 100;
    let encouragement: string;
    if (percentage === 100) {
      encouragement = "太棒了！满分！🌟";
    } else if (percentage >= 80) {
      encouragement = "很棒！继续加油！👏";
    } else if (percentage >= 60) {
      encouragement = "不错！再接再厉！💪";
    } else {
      encouragement =
        "别灰心，多读多练！📚";
    }

    return (
      <div className="flex flex-col items-center gap-8 py-8">
        {/* Score circle */}
        <div className="flex h-36 w-36 items-center justify-center rounded-full bg-primary/10 ring-4 ring-primary/20">
          <div className="text-center">
            <div className="text-4xl font-bold text-primary">
              {result.score}/{result.total}
            </div>
            <div className="mt-1 text-sm text-primary/70">
              {Math.round(percentage)}%
            </div>
          </div>
        </div>

        {/* Encouragement and points */}
        <div className="text-center">
          <p className="text-xl font-bold text-forest-800">{encouragement}</p>
          <p className="mt-2 text-lg text-forest-600">
            {"获得"}{" "}
            <span className="font-bold text-primary">
              {result.pointsEarned}
            </span>{" "}
            {"积分"}
          </p>
        </div>

        {/* Back to article list */}
        <button
          type="button"
          onClick={() => router.push("/reading")}
          className="rounded-full bg-forest-100 px-6 py-3 text-base font-medium text-forest-700 transition hover:bg-forest-200 active:scale-95"
        >
          {"返回文章列表"}
        </button>
      </div>
    );
  }

  // ── Submitting phase ──
  if (phase === "submitting") {
    return (
      <div className="flex flex-col items-center gap-6 py-20">
        {submitError ? (
          <div className="rounded-xl bg-red-50 p-6 text-center">
            <p className="text-red-600">{submitError}</p>
            <button
              type="button"
              onClick={() => submitQuiz(answersRef.current)}
              className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white"
            >
              {"重试"}
            </button>
          </div>
        ) : (
          <>
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-forest-200 border-t-primary" />
            <p className="text-forest-600">
              {"提交中..."}
            </p>
          </>
        )}
      </div>
    );
  }

  // ── Quiz phase ──
  const currentQuestion = questions[currentIndex];
  const totalQuestions = questions.length;
  const progressPercent = (currentIndex / totalQuestions) * 100;

  if (!currentQuestion) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm text-forest-500">
          <span>
            {"第"}
            {currentIndex + 1}/{totalQuestions}
            {"题"}
          </span>
          <span>{Math.round(progressPercent)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-forest-100">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Question */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-forest-100 px-3 py-1 text-xs font-medium text-forest-600">
            {typeLabels[currentQuestion.question_type] ||
              currentQuestion.question_type}
          </span>
          {currentQuestion.difficulty > 0 && (
            <span className="text-xs text-forest-400">
              {"★".repeat(currentQuestion.difficulty)}
            </span>
          )}
        </div>
        <p className="text-lg font-medium text-forest-800">
          {currentQuestion.question_text}
        </p>
      </div>

      {/* Options */}
      <div className="space-y-3">
        {currentQuestion.options.map((option) => {
          const isSelected = selectedLabel === option.label;
          return (
            <button
              key={option.label}
              type="button"
              onClick={() => handleSelect(option.label)}
              disabled={selectedLabel !== null}
              className={`flex w-full items-center gap-3 rounded-xl border-2 p-4 text-left transition-all active:scale-[0.98] disabled:cursor-default ${
                isSelected
                  ? "border-primary bg-primary/10"
                  : "border-forest-200 bg-white hover:border-forest-300"
              }`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${
                  isSelected
                    ? "bg-primary text-white"
                    : "bg-forest-100 text-forest-600"
                }`}
              >
                {option.label}
              </span>
              <span
                className={`text-base ${
                  isSelected
                    ? "font-medium text-primary-dark"
                    : "text-forest-700"
                }`}
              >
                {option.text}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
