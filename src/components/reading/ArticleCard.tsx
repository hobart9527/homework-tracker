"use client";

import { useState } from "react";

interface ArticleCardProps {
  id: string;
  title: string;
  gradeLevel: number;
  category: string;
  difficulty: number;
  wordCount: number;
  estimatedMinutes: number;
  coverImageUrl?: string;
  isRecommended?: boolean;
  isCompleted?: boolean;
  isInProgress?: boolean;
  score?: number;
  language?: "zh" | "en";
  onClick: () => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  时事: "bg-sky-100 text-sky-700",
  历史: "bg-honey-100 text-honey-700",
  科学: "bg-indigo-100 text-indigo-700",
  人物: "bg-coral-100 text-coral-700",
  自然: "bg-emerald-100 text-emerald-700",
  文化: "bg-purple-100 text-purple-700",
  成语故事: "bg-rose-100 text-rose-700",
  寓言: "bg-amber-100 text-amber-700",
  现代文: "bg-teal-100 text-teal-700",
  科普: "bg-cyan-100 text-cyan-700",
};

function getCategoryStyle(category: string): string {
  return CATEGORY_COLORS[category] || "bg-forest-100 text-forest-700";
}

export function ArticleCard({
  title,
  gradeLevel,
  category,
  wordCount,
  estimatedMinutes,
  coverImageUrl,
  isRecommended,
  isCompleted,
  isInProgress,
  score,
  language,
  onClick,
}: ArticleCardProps) {
  const [imgLoaded, setImgLoaded] = useState(false);

  const thumbnailUrl = coverImageUrl
    ? `${coverImageUrl}?width=400&format=webp&quality=70`
    : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative w-full text-left rounded-xl bg-white transition-all hover:shadow-elevation-floating hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary overflow-hidden ${
        isCompleted
          ? "shadow-[0_0_0_2px_#F59E0B] ring-2 ring-amber-400"
          : "shadow-elevation-raised ring-1 ring-cream-200/40"
      }`}
    >
      {/* Cover image */}
      {thumbnailUrl ? (
        <div className="relative aspect-[3/2] w-full bg-ink-100">
          {!imgLoaded && (
            <div className="absolute inset-0 animate-pulse bg-ink-100" />
          )}
          <img
            src={thumbnailUrl}
            alt={title}
            onLoad={() => setImgLoaded(true)}
            className={`h-full w-full object-cover rounded-t-xl transition-opacity duration-300 ${
              imgLoaded ? "opacity-100" : "opacity-0"
            }`}
          />
          {isCompleted && (
            <div className="absolute top-2 right-2 z-10 bg-amber-400 text-white text-xs font-bold px-2 py-1 rounded-full shadow-md flex items-center gap-1">
              <span>⭐</span>
              <span>已完成</span>
            </div>
          )}
        </div>
      ) : (
        <div className="relative aspect-[3/2] w-full flex items-center justify-center bg-gradient-to-br from-forest-100 to-cream-200">
          <span className="text-5xl opacity-40">
            {category.charAt(0)}
          </span>
        </div>
      )}

      {/* Recommended banner */}
      {isRecommended && (
        <div className="flex items-center gap-1.5 bg-gradient-to-r from-honey-300 to-coral-400 px-4 py-1.5 text-xs font-semibold text-white">
          <span>🎯</span>
          <span>今日推荐</span>
        </div>
      )}

      {/* In-progress badge */}
      {isInProgress && !isCompleted && (
        <div className="flex items-center gap-1.5 bg-amber-100 px-4 py-1.5 text-xs font-semibold text-amber-700">
          <span>📖</span>
          <span>阅读中</span>
        </div>
      )}

      <div className="p-4">
        {/* Top row: category tag + grade level */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${getCategoryStyle(category)}`}
          >
            {category}
          </span>
          <span className="inline-block rounded-full bg-cream-50 px-2.5 py-0.5 text-xs font-medium text-ink-600">
            G{gradeLevel}
          </span>
          {isCompleted && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
              <span>✓</span>
              <span>已完成</span>
            </span>
          )}
          {language === "en" ? (
            <span className="ml-auto text-[10px] font-medium text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded">
              EN
            </span>
          ) : language === "zh" ? (
            <span className="ml-auto text-[10px] font-medium text-coral-600 bg-coral-50 px-1.5 py-0.5 rounded">
              中文
            </span>
          ) : null}
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
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
          <span className="inline-flex items-center gap-1">
            📝 {wordCount}字
          </span>
          <span className="inline-flex items-center gap-1">
            ⏱️ {estimatedMinutes}分钟
          </span>
        </div>
      </div>
    </button>
  );
}
