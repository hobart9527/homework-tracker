"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import PageShell from "@/components/ui/PageShell";
import PageHeader from "@/components/ui/PageHeader";
import { LevelBadge, type ReadingLevel } from "@/components/reading/LevelBadge";
import { MasteryGateCard, type MasteryGateData } from "@/components/reading/MasteryGateCard";
import { DrawButton, type DrawMode } from "@/components/reading/DrawButton";
import { ReadingTitleBadge } from "@/components/reading/ReadingTitleBadge";
import { IconBook, IconSparkle } from "@/components/ui/icons";

// ── Types ─────────────────────────────────────────────────────────

interface ReadingProgress {
  level: ReadingLevel;
  articlesCompleted: number;
  articlesRequired: number;
  averageAccuracy: number;
  accuracyRequired: number;
  recentTrend: "up" | "down" | "flat";
  difficultyFeeling: "just-right" | "too-hard" | "too-easy";
  streakDays: number;
  speedWpm: number;
}

// ── Mock data (fallback when API unavailable) ─────────────────────

const MOCK_PROGRESS: ReadingProgress = {
  level: "L2",
  articlesCompleted: 5,
  articlesRequired: 8,
  averageAccuracy: 72,
  accuracyRequired: 75,
  recentTrend: "up",
  difficultyFeeling: "just-right",
  streakDays: 3,
  speedWpm: 120,
};

// ── Component ─────────────────────────────────────────────────────

export default function ReadingProgressPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const locale = useLocale();
  const [supabase] = useState(() => createClient());

  const [progress, setProgress] = useState<ReadingProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProgress = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push(`/${locale}/child-login`);
        return;
      }

      // Try API first; fall back to mock on failure
      const res = await fetch("/api/reading/progress");
      if (res.ok) {
        const data = await res.json();
        setProgress({
          level: data.level ?? "L1",
          articlesCompleted: data.articlesCompleted ?? 0,
          articlesRequired: data.articlesRequired ?? 8,
          averageAccuracy: data.averageAccuracy ?? 0,
          accuracyRequired: data.accuracyRequired ?? 75,
          recentTrend: data.recentTrend ?? "flat",
          difficultyFeeling: data.difficultyFeeling ?? "just-right",
          streakDays: data.streakDays ?? 0,
          speedWpm: data.speedWpm ?? 0,
        });
      } else {
        // API not ready — use mock data
        setProgress(MOCK_PROGRESS);
      }
    } catch (err) {
      setProgress(MOCK_PROGRESS);
    } finally {
      setLoading(false);
    }
  }, [router, locale, supabase]);

  useEffect(() => {
    void fetchProgress();
  }, [fetchProgress]);

  const handleDraw = useCallback(
    async (mode: DrawMode) => {
      const targetLevel =
        mode === "challenge"
          ? progress?.level === "L1"
            ? "L2"
            : "L3"
          : mode === "easier"
            ? progress?.level === "L3"
              ? "L2"
              : "L1"
            : progress?.level ?? "L1";

      const res = await fetch("/api/reading/progress/draw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, targetLevel }),
      });

      if (res.ok) {
        const data = await res.json();
        return { articleId: data.articleId as string };
      }
      return null;
    },
    [progress?.level]
  );

  if (loading) {
    return (
      <PageShell skin="child">
        <div className="mx-auto max-w-3xl p-4 pb-24">
          <div className="animate-pulse space-y-4">
            <div className="h-24 rounded-radius-xl bg-white ring-1 ring-cream-200/40" />
            <div className="h-48 rounded-radius-xl bg-white ring-1 ring-cream-200/40" />
            <div className="h-24 rounded-radius-xl bg-white ring-1 ring-cream-200/40" />
          </div>
        </div>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell skin="child">
        <div className="mx-auto flex max-w-3xl flex-col items-center justify-center p-4 pb-24 text-center">
          <div className="rounded-radius-xl bg-white ring-1 ring-cream-200/40 p-8 shadow-elevation-raised">
            <IconBook className="mx-auto mb-3 h-10 w-10 text-ink-300" />
            <h2 className="text-lg font-bold text-forest-800">加载失败</h2>
            <p className="mt-1 text-sm text-ink-500">{error}</p>
            <button
              type="button"
              onClick={() => void fetchProgress()}
              className="mt-4 rounded-full bg-primary px-5 py-2 text-sm font-medium text-white shadow-elevation-raised transition hover:bg-primary-dark"
            >
              {t("common.retry")}
            </button>
          </div>
        </div>
      </PageShell>
    );
  }

  const p = progress ?? MOCK_PROGRESS;

  const masteryData: MasteryGateData = {
    articlesCompleted: p.articlesCompleted,
    articlesRequired: p.articlesRequired,
    averageAccuracy: p.averageAccuracy,
    accuracyRequired: p.accuracyRequired,
    recentTrend: p.recentTrend,
    difficultyFeeling: p.difficultyFeeling,
  };

  const allGatesMet =
    p.articlesCompleted >= p.articlesRequired &&
    p.averageAccuracy >= p.accuracyRequired;

  return (
    <PageShell skin="child">
      <div className="mx-auto max-w-3xl p-4 pb-24">
        {/* ── Page Header ───────────────────────────────────────── */}
        <PageHeader
          skin="child"
          title="阅读进度"
          subtitle="跟踪你的阅读成长，挑战更高档位"
        />

        {/* ── Level + Title Badge ───────────────────────────────── */}
        <section className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <LevelBadge level={p.level} showLabel size="md" />
          <ReadingTitleBadge
            accuracy={p.averageAccuracy}
            speed={p.speedWpm}
            streak={p.streakDays}
          />
        </section>

        {/* ── Upgrade readiness banner ──────────────────────────── */}
        {allGatesMet && (
          <div className="mt-4 flex items-center gap-3 rounded-radius-xl bg-gradient-to-r from-honey-50 to-coral-50 p-4 ring-1 ring-honey-200 animate-fade-in-up">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-honey-100">
              <IconSparkle className="h-5 w-5 text-honey-600" />
            </div>
            <div>
              <div className="text-sm font-bold text-forest-800">
                恭喜你，可以升级了！
              </div>
              <div className="text-xs text-ink-500">
                已完成 {p.articlesRequired} 篇，平均正确率 {p.averageAccuracy}%
              </div>
            </div>
          </div>
        )}

        {/* ── Mastery Gate Card ─────────────────────────────────── */}
        <section className="mt-5">
          <MasteryGateCard data={masteryData} />
        </section>

        {/* ── Draw Buttons ──────────────────────────────────────── */}
        <section className="mt-6">
          <h2 className="mb-3 text-base font-bold text-forest-800">
            下一篇推荐
          </h2>
          <DrawButton currentLevel={p.level} onDraw={handleDraw} />
        </section>

        {/* ── Tips / encouragement ──────────────────────────────── */}
        <section className="mt-6 rounded-radius-xl bg-forest-50 p-4 ring-1 ring-forest-100">
          <h3 className="text-sm font-bold text-forest-800">小贴士</h3>
          <ul className="mt-2 space-y-1.5 text-xs text-forest-600">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-forest-400" />
              每完成 8 篇且正确率达到 75% 即可解锁下一档位
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-forest-400" />
              "挑战一下" 可以提前体验更高档位的内容
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-forest-400" />
              "换个简单的" 让你轻松复习巩固
            </li>
          </ul>
        </section>
      </div>
    </PageShell>
  );
}
