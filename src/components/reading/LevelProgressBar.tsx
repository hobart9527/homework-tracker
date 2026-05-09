"use client";

import { useEffect, useState } from "react";

interface ReadingStats {
  child_id: string;
  reading_level: string;
  total_articles_read: number;
  articles_at_current_level: number;
  accuracy_streak: number;
  grade_equivalent: number;
}

interface LevelProgressBarProps {
  childId: string;
  onLevelUp?: (newLevel: string) => void;
}

// Level colors based on range — using semantic color names
const LEVEL_COLORS: Record<string, string> = {
  L1: "bg-success",
  L2: "bg-success",
  L3: "bg-success",
  L4: "bg-info",
  L5: "bg-info",
  L6: "bg-info",
  L7: "bg-purple-500",
  L8: "bg-purple-500",
  L9: "bg-purple-500",
  L10: "bg-purple-500",
  L11: "bg-purple-500",
  L12: "bg-purple-500",
};

const LEVEL_TEXT_COLORS: Record<string, string> = {
  L1: "text-success",
  L2: "text-success",
  L3: "text-success",
  L4: "text-info",
  L5: "text-info",
  L6: "text-info",
  L7: "text-purple-700",
  L8: "text-purple-700",
  L9: "text-purple-700",
  L10: "text-purple-700",
  L11: "text-purple-700",
  L12: "text-purple-700",
};

const LEVEL_BG_COLORS: Record<string, string> = {
  L1: "bg-success/10 border-success/20",
  L2: "bg-success/10 border-success/20",
  L3: "bg-success/10 border-success/20",
  L4: "bg-info/10 border-info/20",
  L5: "bg-info/10 border-info/20",
  L6: "bg-info/10 border-info/20",
  L7: "bg-purple-50 border-purple-200",
  L8: "bg-purple-50 border-purple-200",
  L9: "bg-purple-50 border-purple-200",
  L10: "bg-purple-50 border-purple-200",
  L11: "bg-purple-50 border-purple-200",
  L12: "bg-purple-50 border-purple-200",
};

const LEVEL_DESCRIPTIONS: Record<string, string> = {
  L1: "Grade 1, RAZ aa-A",
  L2: "Grade 2, RAZ B-C",
  L3: "Grade 3, RAZ D-F",
  L4: "Grade 4, RAZ G-H",
  L5: "Grade 5, RAZ I-J",
  L6: "Grade 6, RAZ K-M",
  L7: "Grade 7, RAZ N-P",
  L8: "Grade 8, RAZ Q-R",
  L9: "Grade 9, RAZ S-T",
  L10: "Grade 10, RAZ U-V",
  L11: "Grade 11, RAZ W-X",
  L12: "Grade 12, RAZ Y-Z",
};

const ARTICLES_PER_LEVEL = 15;

export function LevelProgressBar({ childId, onLevelUp }: LevelProgressBarProps) {
  const [stats, setStats] = useState<ReadingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchStats = async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/reading/stats?childId=${encodeURIComponent(childId)}`);
        if (!res.ok) throw new Error("Failed to fetch stats");
        const data: ReadingStats = await res.json();
        if (!cancelled) setStats(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchStats();
    return () => { cancelled = true; };
  }, [childId]);

  // Notify parent of level up
  useEffect(() => {
    if (stats?.reading_level && onLevelUp) {
      // This effect can be used for external level-up detection
    }
  }, [stats?.reading_level, onLevelUp]);

  if (loading) {
    return (
      <div className="mb-6 animate-pulse rounded-xl border border-ink-200 bg-white/80 p-4">
        <div className="mb-3 h-5 w-32 rounded bg-ink-100" />
        <div className="mb-2 h-3 w-full rounded bg-ink-100" />
        <div className="h-3 w-3/4 rounded bg-ink-100" />
      </div>
    );
  }

  if (error || !stats) {
    return null;
  }

  const level = stats.reading_level || "L3";
  const articlesAtLevel = stats.articles_at_current_level || 0;
  const streak = stats.accuracy_streak || 0;
  const progressPercent = Math.min((articlesAtLevel / ARTICLES_PER_LEVEL) * 100, 100);
  const articlesNeeded = Math.max(ARTICLES_PER_LEVEL - articlesAtLevel, 0);
  const streakMet = streak >= 3;

  const color = LEVEL_COLORS[level] || "bg-ink-400";
  const textColor = LEVEL_TEXT_COLORS[level] || "text-ink-700";
  const bgColor = LEVEL_BG_COLORS[level] || "bg-ink-50 border-ink-200";
  const description = LEVEL_DESCRIPTIONS[level] || "";

  return (
    <div className={`mb-6 rounded-xl border bg-white/80 p-5 shadow-elevation-raised ${bgColor}`}>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${color} text-white font-bold text-lg shadow-elevation-raised`}>
            {level}
          </div>
          <div>
            <h3 className={`text-lg font-bold ${textColor}`}>
              当前级别
            </h3>
            <p className="text-xs text-ink-500">{description}</p>
          </div>
        </div>

        {/* Streak indicator */}
        <div className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${
          streakMet ? "bg-honey-100 text-honey-700" : "bg-ink-100 text-ink-600"
        }`}>
          <span>{streakMet ? "✨" : "🔥"}</span>
          <span>连续正确率: {streak}/3</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="mb-1.5 flex justify-between text-sm">
          <span className="text-ink-600">
            已读 {articlesAtLevel}/{ARTICLES_PER_LEVEL} 篇
          </span>
          <span className={`font-medium ${textColor}`}>
            {Math.round(progressPercent)}%
          </span>
        </div>
        <div className="relative h-3 w-full overflow-hidden rounded-full bg-ink-100">
          <div
            className={`absolute left-0 top-0 h-full rounded-full transition-all duration-500 ease-out ${color}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Upgrade hint */}
      {articlesNeeded > 0 ? (
        <p className="text-sm text-ink-500">
          再读 <span className="font-semibold text-ink-700">{articlesNeeded}</span> 篇即可升级！
          {streakMet ? (
            <span className="ml-1 text-honey-600">（连续正确率已达标）</span>
          ) : (
            <span className="ml-1 text-ink-400">（需连续 {3 - streak} 篇≥80%）</span>
          )}
        </p>
      ) : streakMet ? (
        <p className="text-sm font-medium text-success">
          恭喜！已达到升级条件，等待自动升级中...
        </p>
      ) : (
        <p className="text-sm text-ink-500">
          再连续 <span className="font-semibold text-ink-700">{3 - streak}</span> 篇≥80%即可升级！
        </p>
      )}

      {/* Level range legend */}
      <div className="mt-4 flex items-center gap-4 border-t border-ink-200/50 pt-3">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-success" />
          <span className="text-xs text-ink-500">L1-L3</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-info" />
          <span className="text-xs text-ink-500">L4-L6</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-purple-500" />
          <span className="text-xs text-ink-500">L7-L12</span>
        </div>
      </div>
    </div>
  );
}
