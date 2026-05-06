"use client";

interface ArticleCardProps {
  id: string;
  title: string;
  gradeLevel: number;
  category: string;
  difficulty: number;
  wordCount: number;
  estimatedMinutes: number;
  isRecommended?: boolean;
  isCompleted?: boolean;
  score?: number;
  onClick: () => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  时事: "bg-sky-100 text-sky-700",
  历史: "bg-amber-100 text-amber-700",
  科学: "bg-indigo-100 text-indigo-700",
  人物: "bg-rose-100 text-rose-700",
  自然: "bg-emerald-100 text-emerald-700",
  文化: "bg-purple-100 text-purple-700",
};

function getCategoryStyle(category: string): string {
  return CATEGORY_COLORS[category] || "bg-forest-100 text-forest-700";
}

function DifficultyStars({ difficulty }: { difficulty: number }) {
  const clamped = Math.max(1, Math.min(5, Math.round(difficulty)));
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`难度 ${clamped}/5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={`text-xs ${i < clamped ? "text-amber-400" : "text-gray-200"}`}
        >
          ★
        </span>
      ))}
    </span>
  );
}

export function ArticleCard({
  title,
  gradeLevel,
  category,
  difficulty,
  wordCount,
  estimatedMinutes,
  isRecommended,
  isCompleted,
  score,
  onClick,
}: ArticleCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative w-full text-left rounded-2xl bg-white shadow-sm ring-1 ring-forest-100 transition-all hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary overflow-hidden"
    >
      {/* Recommended banner */}
      {isRecommended && (
        <div className="flex items-center gap-1.5 bg-gradient-to-r from-amber-300 to-orange-400 px-4 py-1.5 text-xs font-semibold text-white">
          <span>🎯</span>
          <span>今日推荐</span>
        </div>
      )}

      <div className="p-4">
        {/* Top row: category tag + grade level */}
        <div className="flex items-center gap-2 mb-3">
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${getCategoryStyle(category)}`}
          >
            {category}
          </span>
          <span className="inline-block rounded-full bg-forest-50 px-2.5 py-0.5 text-xs font-medium text-forest-600">
            G{gradeLevel}
          </span>
          {isCompleted && (
            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
              <span>✓</span>
              <span>已完成</span>
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="font-semibold text-forest-800 line-clamp-2 min-h-[2.5rem]">
          {title}
        </h3>

        {/* Score display if completed */}
        {isCompleted && score !== undefined && (
          <div className="mt-2 inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-sm font-bold text-primary">
            ⭐ {score}分
          </div>
        )}

        {/* Bottom row: metadata */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-forest-500">
          <span className="inline-flex items-center gap-1">
            📝 {wordCount}字
          </span>
          <span className="inline-flex items-center gap-1">
            ⏱️ {estimatedMinutes}分钟
          </span>
          <DifficultyStars difficulty={difficulty} />
        </div>
      </div>
    </button>
  );
}
