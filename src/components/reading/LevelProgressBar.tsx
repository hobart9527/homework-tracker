"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

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
  const t = useTranslations();
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
      <div className="mb-6 animate-pulse rounded-xl border border-ink-300 bg-cream-100/80 p-4">
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
  const bgColor = LEVEL_BG_COLORS[level] || "bg-ink-50 border-ink-300";
  const description = LEVEL_DESCRIPTIONS[level] || "";

  return (
    <div className={`mb-6 rounded-xl border bg-cream-100/80 p-5 shadow-elevation-raised ${bgColor}`}>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${color} text-white font-bold text-lg shadow-elevation-raised`}>
            {level}
          </div>
          <div>
            <h3 className={`text-lg font-bold ${textColor}`}>
              {t("reading.levelProgress.currentLevel")}
            </h3>
            <p className="text-xs text-ink-500">{description}</p>
          </div>
        </div>

        {/* Streak indicator */}
        <div className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${
          streakMet ? "bg-honey-100 text-honey-700" : "bg-ink-100 text-ink-600"
        }`}>
          <span>
            {streakMet ? (
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 inline-block">
                <path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 inline-block">
                <path d="M12 2c-1.5 3-4 5-5 8-1 3 0 6 2 8 1 1 2 2 3 2s2-1 3-2c2-2 3-5 2-8-1-3-3.5-5-5-8z" />
              </svg>
            )}
          </span>
          <span>{t("reading.levelProgress.streakLabel", { streak })}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="mb-1.5 flex justify-between text-sm">
          <span className="text-ink-600">
            {t("reading.levelProgress.readCount", { count: articlesAtLevel, total: ARTICLES_PER_LEVEL })}
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
          {t("reading.levelProgress.upgradeHint", { needed: articlesNeeded })}
          {streakMet ? (
            <span className="ml-1 text-honey-600">{t("reading.levelProgress.streakMet")}</span>
          ) : (
            <span className="ml-1 text-ink-400">{t("reading.levelProgress.streakNeeded", { needed: 3 - streak })}</span>
          )}
        </p>
      ) : streakMet ? (
        <p className="text-sm font-medium text-success">
          {t("reading.levelProgress.levelUpPending")}
        </p>
      ) : (
        <p className="text-sm text-ink-500">
          {t("reading.levelProgress.consecutiveNeeded", { needed: 3 - streak })}
        </p>
      )}

      {/* Level range legend */}
      <div className="mt-4 flex items-center gap-4 border-t border-ink-300/50 pt-3">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-success" />
          <span className="text-xs text-ink-500">{t("reading.levelProgress.levelRange1")}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-info" />
          <span className="text-xs text-ink-500">{t("reading.levelProgress.levelRange2")}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-purple-500" />
          <span className="text-xs text-ink-500">{t("reading.levelProgress.levelRange3")}</span>
        </div>
      </div>
    </div>
  );
}
