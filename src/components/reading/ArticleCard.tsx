"use client";

import { useState } from "react";

import { IconStar, IconBook, IconPencil } from "@/components/ui/icons";

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
  时事: "bg-forest-100 text-forest-700",
  历史: "bg-cream-200 text-ink-700",
  科学: "bg-forest-subtle text-forest-600",
  人物: "bg-coral-100 text-coral-700",
  自然: "bg-forest-100 text-forest-700",
  文化: "bg-cream-200 text-ink-700",
  成语故事: "bg-coral-subtle text-coral-700",
  寓言: "bg-cream-200 text-ink-700",
  现代文: "bg-forest-subtle text-forest-600",
  科普: "bg-forest-100 text-forest-700",
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
        <div className="relative aspect-[16/9] w-full bg-ink-100">
          {!imgLoaded && (
            <div className="absolute inset-0 animate-pulse bg-ink-100" />
          )}
          <img
            src={thumbnailUrl}
            alt={title}
            loading="lazy"
            onLoad={() => setImgLoaded(true)}
            className={`h-full w-full object-cover rounded-t-xl transition-opacity duration-300 ${
              imgLoaded ? "opacity-100" : "opacity-0"
            }`}
          />
          {isCompleted && (
            <div className="absolute top-2 right-2 z-10 bg-amber-400 text-white text-xs font-bold px-2 py-1 rounded-full shadow-md flex items-center gap-1">
              <IconStar className="w-3.5 h-3.5" />
              <span>已完成</span>
            </div>
          )}
        </div>
      ) : (
        <div className="relative aspect-[16/9] w-full flex items-center justify-center bg-gradient-to-br from-forest-100 to-cream-200">
          <span className="text-5xl opacity-40">
            {category.charAt(0)}
          </span>
        </div>
      )}

      <div className="p-3">
        {/* Top row: category tag + grade level + status + language */}
        <div className="flex items-center gap-2 mb-2">
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${getCategoryStyle(category)}`}
          >
            {category}
          </span>
          <span className="inline-block rounded-full bg-cream-50 px-2.5 py-0.5 text-xs font-medium text-ink-600">
            G{gradeLevel}
          </span>
          {isInProgress && !isCompleted && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
              <IconBook className="w-3.5 h-3.5" />
              <span>阅读中</span>
            </span>
          )}
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
        <h3 className="font-semibold text-forest-800 line-clamp-2">
          {title}
        </h3>

        {/* Score display if completed */}
        {isCompleted && score !== undefined && (
          <div className="mt-1.5 inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-sm font-bold text-primary">
            <IconStar className="w-3.5 h-3.5 mr-0.5" /> {score}分
          </div>
        )}

        {/* Bottom row: metadata */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
          <span className="inline-flex items-center gap-1">
            <IconPencil className="w-3 h-3" /> {wordCount}字
          </span>
          <span className="inline-flex items-center gap-1">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>{" "}
            {estimatedMinutes}分钟
          </span>
        </div>
      </div>
    </button>
  );
}
