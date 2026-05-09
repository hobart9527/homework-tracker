"use client";

import { useState } from "react";

interface MagazineCardProps {
  id: string;
  title: string;
  gradeLevel: number;
  category: string;
  wordCount: number;
  estimatedMinutes: number;
  coverImageUrl?: string;
  isCompleted?: boolean;
  score?: number;
  language?: "zh" | "en";
  progress?: number; // 0-100，阅读进度
  onClick: () => void;
  onPreview?: () => void;
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
  news: "bg-sky-100 text-sky-700",
  history: "bg-honey-100 text-honey-700",
  science: "bg-indigo-100 text-indigo-700",
  biography: "bg-coral-100 text-coral-700",
  nature: "bg-emerald-100 text-emerald-700",
  culture: "bg-purple-100 text-purple-700",
};

export function MagazineCard({
  title,
  gradeLevel,
  category,
  wordCount,
  estimatedMinutes,
  coverImageUrl,
  isCompleted,
  score,
  language,
  progress,
  onClick,
  onPreview,
}: MagazineCardProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [showBadge, setShowBadge] = useState(false);

  const thumbnailUrl = coverImageUrl
    ? `${coverImageUrl}?width=600&format=webp&quality=80`
    : null;

  const categoryStyle = CATEGORY_COLORS[category] || "bg-forest-100 text-forest-700";

  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={(e) => {
        e.preventDefault();
        onPreview?.();
      }}
      className="group relative w-full text-left rounded-2xl bg-white shadow-elevation-raised ring-1 ring-cream-200/40 transition-all duration-300 hover:shadow-elevation-floating hover:-translate-y-1 overflow-hidden"
    >
      {/* Cover image - larger, magazine style */}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-ink-100">
        {!imgLoaded && (
          <div className="absolute inset-0 animate-pulse bg-ink-100" />
        )}
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={title}
            onLoad={() => setImgLoaded(true)}
            className={`h-full w-full object-cover transition-all duration-500 group-hover:scale-105 ${
              imgLoaded ? "opacity-100" : "opacity-0"
            }`}
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-forest-100 to-cream-200">
            <span className="text-6xl opacity-30 font-reading-zh">{category.charAt(0)}</span>
          </div>
        )}

        {/* Language badge - top right */}
        <div className="absolute top-3 right-3">
          <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
            language === "en"
              ? "bg-sky-500/90 text-white"
              : "bg-coral-500/90 text-white"
          }`}>
            {language === "en" ? "EN" : "中文"}
          </span>
        </div>

        {/* Progress overlay */}
        {progress !== undefined && progress > 0 && !isCompleted && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-ink-200/50">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>

      <div className="p-5">
        {/* Category + Grade */}
        <div className="flex items-center gap-2 mb-3">
          <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${categoryStyle}`}>
            {category}
          </span>
          <span className="inline-block rounded-full bg-cream-50 px-3 py-1 text-xs font-medium text-ink-500">
            G{gradeLevel}
          </span>
        </div>

        {/* Title - magazine style font */}
        <h3 className={`font-semibold text-forest-800 line-clamp-2 min-h-[3rem] text-lg leading-snug ${
          language === "zh" ? "font-reading-zh" : "font-reading-en"
        }`}>
          {title}
        </h3>

        {/* Bottom row */}
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-ink-400">
            <span>{wordCount} 字</span>
            <span className="w-1 h-1 rounded-full bg-ink-300" />
            <span>{estimatedMinutes} 分钟</span>
          </div>

          {/* Completion badge */}
          {isCompleted && (
            <div
              className="relative"
              onMouseEnter={() => setShowBadge(true)}
              onMouseLeave={() => setShowBadge(false)}
            >
              <div className="flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-700">
                <span>✓</span>
                <span>{score}分</span>
              </div>
              {showBadge && score !== undefined && (
                <div className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-forest-800 text-white text-xs rounded-lg whitespace-nowrap z-10">
                  得分: {score}/100
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
