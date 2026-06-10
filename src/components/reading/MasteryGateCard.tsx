"use client";

import { useMemo } from "react";
import { IconStar, IconTrendingUp, IconCheckCircle, IconWarning } from "@/components/ui/icons";

export interface MasteryGateData {
  articlesCompleted: number;
  articlesRequired: number;
  averageAccuracy: number;
  accuracyRequired: number;
  recentTrend: "up" | "down" | "flat";
  difficultyFeeling: "just-right" | "too-hard" | "too-easy";
}

interface MasteryGateCardProps {
  data: MasteryGateData;
}

const TREND_META = {
  up: { icon: "↑", label: "上升", color: "text-emerald-600", bg: "bg-emerald-50" },
  down: { icon: "↓", label: "下降", color: "text-coral-600", bg: "bg-coral-50" },
  flat: { icon: "→", label: "持平", color: "text-ink-500", bg: "bg-ink-50" },
};

const DIFFICULTY_META = {
  "just-right": { label: "刚好", color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
  "too-hard": { label: "稍难", color: "text-coral-700", bg: "bg-coral-50", border: "border-coral-200" },
  "too-easy": { label: "太简单", color: "text-honey-700", bg: "bg-honey-50", border: "border-honey-200" },
};

function CircularProgress({
  value,
  max,
  size = 64,
  strokeWidth = 5,
  color = "#56AB91",
  label,
}: {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  label: string;
}) {
  const percent = Math.min((value / max) * 100, 100);
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#E8EAED"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold text-ink-800">{Math.round(percent)}%</span>
        </div>
      </div>
      <span className="text-[10px] text-ink-500">{label}</span>
    </div>
  );
}

function LinearProgress({
  value,
  max,
  colorClass = "bg-emerald-500",
  label,
  showFraction = true,
}: {
  value: number;
  max: number;
  colorClass?: string;
  label: string;
  showFraction?: boolean;
}) {
  const percent = Math.min((value / max) * 100, 100);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-ink-600 font-medium">{label}</span>
        {showFraction && (
          <span className="text-ink-800 font-bold">
            {value}/{max}
          </span>
        )}
      </div>
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-ink-100">
        <div
          className={`absolute left-0 top-0 h-full rounded-full transition-all duration-700 ease-out ${colorClass}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function MasteryGateCard({ data }: MasteryGateCardProps) {
  const articlesMet = data.articlesCompleted >= data.articlesRequired;
  const accuracyMet = data.averageAccuracy >= data.accuracyRequired;
  const allHardGatesMet = articlesMet && accuracyMet;

  const trend = TREND_META[data.recentTrend];
  const difficulty = DIFFICULTY_META[data.difficultyFeeling];

  const accuracyColor = useMemo(() => {
    if (data.averageAccuracy >= 85) return "bg-emerald-500";
    if (data.averageAccuracy >= 70) return "bg-honey-400";
    return "bg-coral-400";
  }, [data.averageAccuracy]);

  return (
    <div className="rounded-radius-xl bg-white ring-1 ring-cream-200/40 shadow-elevation-raised p-space-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <IconStar className="w-5 h-5 text-honey-500" />
          <h3 className="text-base font-bold text-forest-800">升级进度</h3>
        </div>
        {allHardGatesMet && (
          <div className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 border border-emerald-200 animate-stamp-reveal">
            <IconCheckCircle className="w-3.5 h-3.5" />
            可以升级了！
          </div>
        )}
      </div>

      {/* Progress grid: 2x2 on tablet+, stacked on mobile */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Articles count — linear */}
        <LinearProgress
          value={data.articlesCompleted}
          max={data.articlesRequired}
          label="已完成篇数"
          colorClass={articlesMet ? "bg-emerald-500" : "bg-forest-400"}
        />

        {/* Accuracy — circular */}
        <div className="flex items-center gap-3">
          <CircularProgress
            value={data.averageAccuracy}
            max={100}
            size={56}
            strokeWidth={5}
            color={data.averageAccuracy >= data.accuracyRequired ? "#56AB91" : "#F2CC8F"}
            label="平均正确率"
          />
          <div className="flex-1">
            <div className="text-xs text-ink-500 mb-1">
              目标: {data.accuracyRequired}%
            </div>
            <div className={`text-xl font-bold ${accuracyMet ? "text-emerald-600" : "text-ink-700"}`}>
              {data.averageAccuracy}%
            </div>
            {!accuracyMet && (
              <div className="flex items-center gap-1 mt-1 text-[10px] text-coral-600">
                <IconWarning className="w-3 h-3" />
                还需 {data.accuracyRequired - data.averageAccuracy}%
              </div>
            )}
          </div>
        </div>

        {/* Recent trend */}
        <div className="flex items-center gap-3 rounded-radius-lg bg-cream-50 p-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-full ${trend.bg}`}>
            <IconTrendingUp className={`w-5 h-5 ${trend.color}`} />
          </div>
          <div>
            <div className="text-xs text-ink-500">最近3篇趋势</div>
            <div className={`text-base font-bold ${trend.color}`}>
              {trend.icon} {trend.label}
            </div>
          </div>
        </div>

        {/* Difficulty feeling */}
        <div className={`flex items-center gap-3 rounded-radius-lg border p-3 ${difficulty.bg} ${difficulty.border}`}>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/80">
            <span className="text-lg">
              {data.difficultyFeeling === "just-right" && "😊"}
              {data.difficultyFeeling === "too-hard" && "😰"}
              {data.difficultyFeeling === "too-easy" && "🥱"}
            </span>
          </div>
          <div>
            <div className="text-xs text-ink-500">难度感受</div>
            <div className={`text-base font-bold ${difficulty.color}`}>{difficulty.label}</div>
          </div>
        </div>
      </div>

      {/* Gate summary bar */}
      <div className="mt-4 flex items-center gap-2 rounded-radius-lg bg-forest-50 p-3">
        <div className="flex-1 flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${articlesMet ? "bg-emerald-500" : "bg-ink-300"}`} />
          <span className="text-xs text-ink-600">篇数门槛</span>
        </div>
        <div className="flex-1 flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${accuracyMet ? "bg-emerald-500" : "bg-ink-300"}`} />
          <span className="text-xs text-ink-600">正确率门槛</span>
        </div>
        <div className="text-xs font-bold text-forest-700">
          {allHardGatesMet ? "全部满足" : "进行中"}
        </div>
      </div>
    </div>
  );
}
