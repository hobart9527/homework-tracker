"use client";

import { IconSprout, IconRocket, IconCrown } from "@/components/ui/icons";

export type ReadingLevel = "L1" | "L2" | "L3";

interface LevelBadgeProps {
  level: ReadingLevel;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
}

interface LevelMeta {
  label: string;
  phase: string;
  color: string;
  bg: string;
  border: string;
  icon: React.ReactNode;
}

const LEVEL_META: Record<ReadingLevel, LevelMeta> = {
  L1: {
    label: "L1",
    phase: "PYP phase 3-4",
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    icon: <IconSprout className="w-5 h-5 text-emerald-600" />,
  },
  L2: {
    label: "L2",
    phase: "MYP phase 1-2",
    color: "text-sky-700",
    bg: "bg-sky-50",
    border: "border-sky-200",
    icon: <IconRocket className="w-5 h-5 text-sky-600" />,
  },
  L3: {
    label: "L3",
    phase: "MYP phase 3-4",
    color: "text-violet-700",
    bg: "bg-violet-50",
    border: "border-violet-200",
    icon: <IconCrown className="w-5 h-5 text-violet-600" />,
  },
};

const SIZE_MAP = {
  sm: {
    wrapper: "px-2.5 py-1 gap-1.5",
    label: "text-sm",
    phase: "text-[10px]",
    icon: "w-4 h-4",
  },
  md: {
    wrapper: "px-3 py-1.5 gap-2",
    label: "text-base",
    phase: "text-xs",
    icon: "w-5 h-5",
  },
  lg: {
    wrapper: "px-4 py-2 gap-2.5",
    label: "text-lg",
    phase: "text-sm",
    icon: "w-6 h-6",
  },
};

export function LevelBadge({ level, showLabel = true, size = "md" }: LevelBadgeProps) {
  const meta = LEVEL_META[level];
  const s = SIZE_MAP[size];

  return (
    <div
      className={`inline-flex items-center rounded-full border ${meta.bg} ${meta.border} ${s.wrapper}`}
    >
      <span className={s.icon}>{meta.icon}</span>
      {showLabel && (
        <div className="flex flex-col leading-none">
          <span className={`font-bold ${meta.color} ${s.label}`}>{meta.label}</span>
          <span className={`text-ink-500 ${s.phase}`}>{meta.phase}</span>
        </div>
      )}
    </div>
  );
}
