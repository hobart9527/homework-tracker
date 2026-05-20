"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { CompletionStamp } from "./CompletionStamp";

export interface QuizViewQuestion {
  id: string;
  question_text: string;
  question_type: string;
  options: Array<{ label: string; text: string }>;
  difficulty: number;
  hint?: string;
  explanation?: string;
  correct_answer?: string;
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
  questions?: Array<{
    id: string;
    correct_answer: string;
    explanation?: string;
  }>;
}

const typeLabels: Record<string, string> = {
  main_idea: "主旨题",
  detail: "细节题",
  inference: "推理题",
  vocabulary: "词汇题",
  sequence: "排序题",
};

/* ── Circular progress ring ── */
function CircularProgress({
  current,
  total,
}: {
  current: number;
  total: number;
}) {
  const radius = 14;
  const circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? (current / total) * circumference : 0;

  return (
    <div className="relative h-9 w-9">
      <svg
        viewBox="0 0 36 36"
        className="h-full w-full -rotate-90"
        aria-label={`进度 ${current}/${total}`}
      >
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          stroke="#E8EAED"
          strokeWidth="3"
        />
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          stroke="#56AB91"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${progress} ${circumference}`}
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[10px] font-bold text-forest-700">
          {current}/{total}
        </span>
      </div>
    </div>
  );
}

/* ── Streak toast ── */
function StreakToast({ streak }: { streak: number }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 2000);
    return () => clearTimeout(t);
  }, []);

  if (!visible || streak < 3) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-40 flex justify-center">
      <div className="animate-float-up rounded-full bg-honey-100 px-5 py-2 shadow-elevation-floating">
        <span className="text-lg font-bold text-honey-600">
          🔥 x{streak}
        </span>
      </div>
    </div>
  );
}

/* ── Hint panel ── */
function HintPanel({ hint, onDismiss }: { hint: string; onDismiss?: () => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss?.(), 5000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div className="rounded-xl bg-honey-100 border border-honey-200 p-4 mt-3">
      <div className="flex items-start gap-2">
        <span className="text-lg shrink-0">💡</span>
        <div className="flex-1">
          <p className="font-bold text-honey-700">小提示</p>
          <p className="text-sm text-honey-800 mt-1">{hint}</p>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 text-honey-600 hover:text-honey-800 text-sm"
            aria-label="关闭提示"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Option button with liquid fill ── */
function OptionButton({
  option,
  index,
  selected,
  disabled,
  feedback,
  onClick,
}: {
  option: { label: string; text: string };
  index: number;
  selected: boolean;
  disabled: boolean;
  feedback: "correct" | "wrong" | null;
  onClick: () => void;
}) {
  const labelLetters = ["A", "B", "C", "D", "E", "F"];
  const letter = labelLetters[index] ?? option.label;

  let containerClass =
    "relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border-2 p-4 text-left transition-all active:scale-[0.98] disabled:cursor-default ";

  if (feedback === "correct") {
    containerClass +=
      "border-forest-500 bg-forest-50 shadow-[0_0_12px_rgba(86,171,145,0.35)] animate-pulse ";
  } else if (feedback === "wrong") {
    containerClass +=
      "border-coral-400 bg-coral-50 animate-shake ";
  } else if (selected) {
    containerClass += "border-primary bg-primary/10 ";
  } else {
    containerClass +=
      "border-ink-300 bg-white hover:border-ink-300 ";
  }

  let badgeClass =
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm font-bold transition-colors ";

  if (feedback === "correct") {
    badgeClass += "bg-forest-500 text-white ";
  } else if (feedback === "wrong") {
    badgeClass += "bg-coral-500 text-white ";
  } else if (selected) {
    badgeClass += "bg-primary text-white ";
  } else {
    badgeClass += "bg-cream-50 text-ink-600 ";
  }

  let textClass = "text-base transition-colors ";
  if (feedback === "correct") {
    textClass += "font-medium text-forest-800 ";
  } else if (feedback === "wrong") {
    textClass += "font-medium text-coral-700 ";
  } else if (selected) {
    textClass += "font-medium text-primary-dark ";
  } else {
    textClass += "text-forest-700 ";
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={containerClass}
    >
      {/* Liquid fill overlay */}
      {selected && feedback === null && (
        <div className="animate-liquid-fill absolute inset-0 origin-left bg-primary/10" />
      )}
      {feedback === "correct" && (
        <div className="animate-liquid-fill absolute inset-0 origin-left bg-forest-100" />
      )}
      {feedback === "wrong" && (
        <div className="animate-liquid-fill absolute inset-0 origin-left bg-coral-100" />
      )}

      <span className={badgeClass}>{letter}</span>
      <span className={textClass}>{option.text}</span>
    </button>
  );
}

/* ── Quiz result item (per-question breakdown) ── */
function QuizResultItem({
  index,
  question,
  answer,
  correctAnswer,
  explanation,
}: {
  index: number;
  question: QuizViewQuestion;
  answer: { selected: string; correct: boolean } | undefined;
  correctAnswer?: string;
  explanation?: string;
}) {
  const isCorrect = answer?.correct ?? false;
  const childAnswerText =
    question.options.find((o) => o.label === answer?.selected)?.text ??
    answer?.selected ??
    "未作答";
  const correctAnswerText =
    question.options.find((o) => o.label === correctAnswer)?.text ??
    correctAnswer ??
    "";

  return (
    <div className="rounded-xl bg-white ring-1 ring-cream-200/40 p-4 mb-3">
      {/* Top row: number + type + status */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
          {index + 1}
        </span>
        <span className="text-xs text-ink-500">
          {typeLabels[question.question_type] || question.question_type}
        </span>
        {isCorrect ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-forest-100 px-2 py-0.5 text-xs font-medium text-forest-700">
            ✓ 正确
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-coral-100 px-2 py-0.5 text-xs font-medium text-coral-700">
            ✗ 错误
          </span>
        )}
      </div>

      {/* Question text */}
      <p className="text-base font-medium text-forest-800 mb-3">
        {question.question_text}
      </p>

      {/* Answer comparison */}
      <div className="flex flex-wrap gap-2 mb-2">
        <div
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${
            isCorrect
              ? "bg-forest-50 text-forest-700"
              : "bg-coral-50 text-coral-700"
          }`}
        >
          <span className="text-xs text-ink-400">你的答案:</span>
          <span className="font-medium">{childAnswerText}</span>
        </div>
        {!isCorrect && correctAnswerText && (
          <div className="inline-flex items-center gap-1.5 rounded-lg bg-forest-50 px-3 py-1.5 text-sm text-forest-700">
            <span className="text-xs text-ink-400">正确答案:</span>
            <span className="font-medium">{correctAnswerText}</span>
          </div>
        )}
      </div>

      {/* Explanation */}
      {explanation && (
        <div className="text-sm text-ink-600 bg-cream-50 rounded-lg p-3 mt-2">
          {explanation}
        </div>
      )}
    </div>
  );
}

/* ── Main QuizView component ── */
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
  const [phase, setPhase] = useState<
    "quiz" | "submitting" | "results" | "retake" | "retake_results"
  >("quiz");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [showStamp, setShowStamp] = useState(false);

  /* Streak & feedback state */
  const [streak, setStreak] = useState(0);
  const [showStreakToast, setShowStreakToast] = useState(false);
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null);
  const [feedbackPhase, setFeedbackPhase] = useState<"correct" | "wrong" | null>(null);

  /* Retake state */
  const [retakeQuestions, setRetakeQuestions] = useState<QuizViewQuestion[]>([]);
  const [retakeCurrentIndex, setRetakeCurrentIndex] = useState(0);
  const [retakeSelectedLabel, setRetakeSelectedLabel] = useState<string | null>(null);
  const [retakeAnswers, setRetakeAnswers] = useState<Record<string, string>>({});
  const [retakeAttempts, setRetakeAttempts] = useState<Record<string, number>>({});
  const [showHintFor, setShowHintFor] = useState<string | null>(null);
  const [retakeResult, setRetakeResult] = useState<QuizResult | null>(null);
  const [retakeFeedbackPhase, setRetakeFeedbackPhase] = useState<"correct" | "wrong" | null>(null);
  const [retakeEncouragement, setRetakeEncouragement] = useState<string>("");
  const retakeStartTimeRef = useRef<number>(0);

  const startTimeRef = useRef(Date.now());
  const autoAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answersRef = useRef<Record<string, string>>({});
  const correctAnswersRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    return () => {
      if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
      if (feedbackRef.current) clearTimeout(feedbackRef.current);
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
          questions: (data.questions || []).map(
            (q: {
              id: string;
              correct_answer: string;
              explanation?: string;
            }) => ({
              id: q.id,
              correct_answer: q.correct_answer,
              explanation: q.explanation,
            })
          ),
        };
        setResult(mappedResult);
        setPhase("results");
        setShowStamp(true);
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

      const q = questions[currentIndex];
      const updatedAnswers = {
        ...answersRef.current,
        [q.id]: label,
      };
      answersRef.current = updatedAnswers;

      /* Advance after short delay so user sees the selection */
      autoAdvanceRef.current = setTimeout(() => {
        if (currentIndex < questions.length - 1) {
          setCurrentIndex((prev) => prev + 1);
          setSelectedLabel(null);
          setFeedbackPhase(null);
        } else {
          setPhase("submitting");
          submitQuiz(updatedAnswers);
        }
      }, 600);
    },
    [selectedLabel, questions, currentIndex, submitQuiz]
  );

  /* When server result arrives, update streak & feedback for the last question */
  useEffect(() => {
    if (phase === "results" && result) {
      const lastAnswer = result.answers[result.answers.length - 1];
      if (lastAnswer) {
        if (lastAnswer.correct) {
          setStreak((s) => {
            const ns = s + 1;
            if (ns >= 3) setShowStreakToast(true);
            return ns;
          });
          setLastCorrect(true);
        } else {
          setStreak(0);
          setLastCorrect(false);
        }
      }
    }
  }, [phase, result]);

  /* ── Retake handlers ── */
  const startRetake = useCallback(() => {
    if (!result) return;
    const wrongIds = new Set(
      result.answers.filter((a) => !a.correct).map((a) => a.questionId)
    );
    const wrongQuestions = questions.filter((q) => wrongIds.has(q.id));
    if (wrongQuestions.length === 0) return;

    setRetakeQuestions(wrongQuestions);
    setRetakeCurrentIndex(0);
    setRetakeSelectedLabel(null);
    setRetakeAnswers({});
    setRetakeAttempts({});
    setShowHintFor(null);
    setRetakeResult(null);
    setRetakeFeedbackPhase(null);
    setRetakeEncouragement("");
    retakeStartTimeRef.current = Date.now();
    setPhase("retake");
  }, [result, questions]);

  const submitRetake = useCallback(
    async (finalAnswers: Record<string, string>) => {
      setSubmitError(null);
      const timeSpentSeconds = Math.round(
        (Date.now() - retakeStartTimeRef.current) / 1000
      );

      try {
        const response = await fetch("/api/reading/quiz/retake", {
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
        setRetakeResult(mappedResult);
        setPhase("retake_results");

        /* Call onComplete with best score */
        if (result && mappedResult.score > result.score) {
          onComplete(mappedResult);
        }
      } catch {
        setSubmitError("提交失败，请重试");
      }
    },
    [childId, articleId, assignmentId, onComplete, result]
  );

  const handleRetakeSelect = useCallback(
    (label: string) => {
      if (retakeSelectedLabel !== null) return;
      setRetakeSelectedLabel(label);

      const q = retakeQuestions[retakeCurrentIndex];
      const attempts = (retakeAttempts[q.id] || 0) + 1;
      const updatedAttempts = { ...retakeAttempts, [q.id]: attempts };
      setRetakeAttempts(updatedAttempts);

      const isCorrect = q.correct_answer === label;

      if (isCorrect) {
        setRetakeFeedbackPhase("correct");
        setRetakeEncouragement("太棒了！答对了！🎉");
        const updatedAnswers = { ...retakeAnswers, [q.id]: label };
        setRetakeAnswers(updatedAnswers);

        autoAdvanceRef.current = setTimeout(() => {
          if (retakeCurrentIndex < retakeQuestions.length - 1) {
            setRetakeCurrentIndex((prev) => prev + 1);
            setRetakeSelectedLabel(null);
            setRetakeFeedbackPhase(null);
            setRetakeEncouragement("");
            setShowHintFor(null);
          } else {
            setPhase("submitting");
            submitRetake(updatedAnswers);
          }
        }, 1500);
      } else {
        setRetakeFeedbackPhase("wrong");
        if (attempts < 3) {
          setShowHintFor(q.id);
        } else {
          setShowHintFor(null);
          setRetakeEncouragement("正确答案已经告诉你啦，记住它哦！📚");
          /* Reveal correct answer */
          const updatedAnswers = { ...retakeAnswers, [q.id]: q.correct_answer || label };
          setRetakeAnswers(updatedAnswers);

          autoAdvanceRef.current = setTimeout(() => {
            if (retakeCurrentIndex < retakeQuestions.length - 1) {
              setRetakeCurrentIndex((prev) => prev + 1);
              setRetakeSelectedLabel(null);
              setRetakeFeedbackPhase(null);
              setRetakeEncouragement("");
              setShowHintFor(null);
            } else {
              setPhase("submitting");
              submitRetake(updatedAnswers);
            }
          }, 2000);
        }
      }
    },
    [
      retakeSelectedLabel,
      retakeQuestions,
      retakeCurrentIndex,
      retakeAttempts,
      retakeAnswers,
      submitRetake,
    ]
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
      encouragement = "别灰心，多读多练！📚";
    }

    const hasWrongAnswers = result.score < result.total;

    return (
      <div className="flex flex-col items-center gap-6 py-8">
        {/* Streak toast */}
        {showStreakToast && <StreakToast streak={streak} />}

        {/* Completion stamp */}
        <CompletionStamp
          show={showStamp}
          message={percentage === 100 ? "太棒了!" : "已完成!"}
          onDismiss={() => setShowStamp(false)}
        />

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
          <p className="mt-2 text-lg text-ink-600">
            {"获得"}{" "}
            <span className="font-bold text-primary">
              {result.pointsEarned}
            </span>{" "}
            {"积分"}
          </p>
        </div>

        {/* Per-question breakdown */}
        <div className="w-full max-w-2xl px-4">
          <h3 className="text-base font-bold text-forest-800 mb-3">
            答题详情
          </h3>
          <div className="max-h-[50vh] overflow-y-auto pr-1">
            {questions.map((q, idx) => {
              const answer = result.answers.find((a) => a.questionId === q.id);
              const correctAnswer =
                result.questions?.find((rq) => rq.id === q.id)?.correct_answer ??
                q.correct_answer;
              const explanation =
                result.questions?.find((rq) => rq.id === q.id)?.explanation ??
                q.explanation;
              return (
                <QuizResultItem
                  key={q.id}
                  index={idx}
                  question={q}
                  answer={answer}
                  correctAnswer={correctAnswer}
                  explanation={explanation}
                />
              );
            })}
          </div>
        </div>

        {/* Bottom actions */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          {hasWrongAnswers && (
            <button
              type="button"
              onClick={startRetake}
              className="rounded-full bg-primary px-6 py-3 text-base font-medium text-white transition hover:bg-primary/90 active:scale-95"
            >
              {"修正错题"}
            </button>
          )}
          <button
            type="button"
            onClick={() => router.push("/reading")}
            className="rounded-full bg-cream-50 px-6 py-3 text-base font-medium text-ink-700 transition hover:bg-cream-100 active:scale-95"
          >
            {"返回文章列表"}
          </button>
        </div>
      </div>
    );
  }

  // ── Retake results phase ──
  if (phase === "retake_results" && result && retakeResult) {
    const originalScore = result.score;
    const newScore = retakeResult.score;
    const total = result.total;
    const improved = newScore > originalScore;

    return (
      <div className="flex flex-col items-center gap-8 py-8">
        <h2 className="text-2xl font-bold text-forest-800">修正完成！</h2>

        <div className="text-center">
          <p className="text-lg text-ink-600">
            {"原来得分: "}
            <span className="font-bold text-ink-800">
              {originalScore}/{total}
            </span>
            {" → 现在得分: "}
            <span className="font-bold text-primary">
              {newScore}/{total}
            </span>
          </p>
          {improved ? (
            <p className="mt-3 text-xl font-bold text-honey-600">
              进步了！🌟 {"+"}
              {retakeResult.pointsEarned - result.pointsEarned} 积分
            </p>
          ) : (
            <p className="mt-3 text-xl font-bold text-primary">
              继续保持！💪
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => router.push("/reading")}
          className="rounded-full bg-cream-50 px-6 py-3 text-base font-medium text-ink-700 transition hover:bg-cream-100 active:scale-95"
        >
          {"返回文章列表"}
        </button>
      </div>
    );
  }

  // ── Retake phase ──
  if (phase === "retake" && retakeQuestions.length > 0) {
    const currentQuestion = retakeQuestions[retakeCurrentIndex];
    const totalRetake = retakeQuestions.length;
    const attempts = retakeAttempts[currentQuestion.id] || 0;
    const maxAttemptsReached = attempts >= 3 && retakeFeedbackPhase === "wrong";

    return (
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CircularProgress
              current={retakeCurrentIndex + 1}
              total={totalRetake}
            />
            <div>
              <p className="text-sm font-medium text-forest-800">
                修正第 {retakeCurrentIndex + 1} / {totalRetake} 题
              </p>
              <p className="text-xs text-ink-400">
                {typeLabels[currentQuestion.question_type] ||
                  currentQuestion.question_type}
              </p>
            </div>
          </div>
        </div>

        {/* Question */}
        <div className="space-y-4">
          <p className="text-lg font-medium text-forest-800">
            {currentQuestion.question_text}
          </p>
        </div>

        {/* Options */}
        <div className="space-y-3">
          {currentQuestion.options.map((option, idx) => {
            const isSelected = retakeSelectedLabel === option.label;
            let feedback: "correct" | "wrong" | null = null;
            if (isSelected && retakeFeedbackPhase) {
              feedback = retakeFeedbackPhase;
            } else if (
              maxAttemptsReached &&
              option.label === currentQuestion.correct_answer
            ) {
              feedback = "correct";
            }
            return (
              <OptionButton
                key={option.label}
                option={option}
                index={idx}
                selected={isSelected}
                disabled={retakeSelectedLabel !== null}
                feedback={feedback}
                onClick={() => handleRetakeSelect(option.label)}
              />
            );
          })}
        </div>

        {/* Encouragement / feedback text */}
        {retakeEncouragement && (
          <p className="text-center text-base font-medium text-forest-700">
            {retakeEncouragement}
          </p>
        )}

        {/* Hint panel */}
        {showHintFor === currentQuestion.id && currentQuestion.hint && (
          <HintPanel
            hint={currentQuestion.hint}
            onDismiss={() => {
              setShowHintFor(null);
              setRetakeSelectedLabel(null);
            }}
          />
        )}
      </div>
    );
  }

  // ── Submitting phase ──
  if (phase === "submitting") {
    return (
      <div className="flex flex-col items-center gap-6 py-20">
        {submitError ? (
          <div className="rounded-xl bg-coral-50 p-6 text-center">
            <p className="text-coral-600">{submitError}</p>
            <button
              type="button"
              onClick={() => {
                if (phase === "submitting" && result === null) {
                  submitQuiz(answersRef.current);
                } else if (phase === "submitting" && retakeQuestions.length > 0) {
                  submitRetake(retakeAnswers);
                }
              }}
              className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white"
            >
              {"重试"}
            </button>
          </div>
        ) : (
          <>
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-ink-300 border-t-primary" />
            <p className="text-ink-600">{"提交中..."}</p>
          </>
        )}
      </div>
    );
  }

  // ── Quiz phase ──
  const currentQuestion = questions[currentIndex];
  const totalQuestions = questions.length;

  if (!currentQuestion) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Streak toast */}
      {showStreakToast && <StreakToast streak={streak} />}

      {/* Circular progress header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CircularProgress
            current={currentIndex + 1}
            total={totalQuestions}
          />
          <div>
            <p className="text-sm font-medium text-forest-800">
              {typeLabels[currentQuestion.question_type] ||
                currentQuestion.question_type}
            </p>
            {currentQuestion.difficulty > 0 && (
              <p className="text-xs text-ink-400">
                {"★".repeat(currentQuestion.difficulty)}
              </p>
            )}
          </div>
        </div>
        {streak >= 3 && (
          <span className="rounded-full bg-honey-100 px-3 py-1 text-xs font-bold text-honey-600">
            🔥 x{streak}
          </span>
        )}
      </div>

      {/* Question */}
      <div className="space-y-4">
        <p className="text-lg font-medium text-forest-800">
          {currentQuestion.question_text}
        </p>
      </div>

      {/* Options */}
      <div className="space-y-3">
        {currentQuestion.options.map((option, idx) => {
          const isSelected = selectedLabel === option.label;
          return (
            <OptionButton
              key={option.label}
              option={option}
              index={idx}
              selected={isSelected}
              disabled={selectedLabel !== null}
              feedback={
                isSelected
                  ? feedbackPhase
                  : null
              }
              onClick={() => handleSelect(option.label)}
            />
          );
        })}
      </div>
    </div>
  );
}
