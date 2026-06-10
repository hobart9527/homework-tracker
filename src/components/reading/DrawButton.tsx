"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { IconBook, IconRocket, IconSprout } from "@/components/ui/icons";
import type { ReadingLevel } from "./LevelBadge";

export type DrawMode = "normal" | "challenge" | "easier";

interface DrawButtonProps {
  currentLevel: ReadingLevel;
  onDraw?: (mode: DrawMode) => Promise<{ articleId: string } | null>;
}

interface DrawOption {
  mode: DrawMode;
  label: string;
  sublabel: string;
  icon: React.ReactNode;
  variant: "primary" | "coral" | "forest";
}

function getTargetLevel(current: ReadingLevel, mode: DrawMode): ReadingLevel {
  if (mode === "challenge") {
    return current === "L1" ? "L2" : "L3";
  }
  if (mode === "easier") {
    return current === "L3" ? "L2" : "L1";
  }
  return current;
}

export function DrawButton({ currentLevel, onDraw }: DrawButtonProps) {
  const router = useRouter();
  const locale = useLocale();
  const [loading, setLoading] = useState<DrawMode | null>(null);

  const options: DrawOption[] = [
    {
      mode: "normal",
      label: "开始阅读",
      sublabel: `当前档位 · ${currentLevel}`,
      icon: <IconBook className="w-5 h-5" />,
      variant: "primary",
    },
    {
      mode: "challenge",
      label: "挑战一下",
      sublabel: `跳档 · ${getTargetLevel(currentLevel, "challenge")}`,
      icon: <IconRocket className="w-5 h-5" />,
      variant: "coral",
    },
    {
      mode: "easier",
      label: "换个简单的",
      sublabel: `降档 · ${getTargetLevel(currentLevel, "easier")}`,
      icon: <IconSprout className="w-5 h-5" />,
      variant: "forest",
    },
  ];

  const variantStyles: Record<DrawOption["variant"], string> = {
    primary:
      "bg-primary text-white shadow-elevation-raised hover:bg-primary-dark hover:shadow-elevation-floating",
    coral:
      "bg-coral-500 text-white shadow-elevation-raised hover:bg-coral-600 hover:shadow-elevation-floating",
    forest:
      "bg-forest-600 text-white shadow-elevation-raised hover:bg-forest-700 hover:shadow-elevation-floating",
  };

  async function handleClick(mode: DrawMode) {
    if (loading) return;
    setLoading(mode);

    try {
      let articleId: string | null = null;

      if (onDraw) {
        const result = await onDraw(mode);
        articleId = result?.articleId ?? null;
      } else {
        // Fallback: call API directly
        const targetLevel = getTargetLevel(currentLevel, mode);
        const res = await fetch("/api/reading/progress/draw", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode, targetLevel }),
        });
        if (res.ok) {
          const data = await res.json();
          articleId = data.articleId ?? null;
        }
      }

      if (articleId) {
        router.push(`/${locale}/reading/${articleId}`);
      } else {
        // No article available — navigate to browser
        router.push(`/${locale}/reading?filter=${mode}`);
      }
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {options.map((opt) => (
        <button
          key={opt.mode}
          type="button"
          onClick={() => void handleClick(opt.mode)}
          disabled={loading !== null}
          className={`relative flex flex-col items-center gap-2 rounded-radius-xl px-4 py-4 text-center transition-all duration-fast active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed ${variantStyles[opt.variant]}`}
        >
          {loading === opt.mode ? (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            opt.icon
          )}
          <div>
            <div className="text-sm font-bold">{opt.label}</div>
            <div className="text-[10px] opacity-80 mt-0.5">{opt.sublabel}</div>
          </div>
        </button>
      ))}
    </div>
  );
}
