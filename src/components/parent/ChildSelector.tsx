"use client";

import type { Database } from "@/lib/supabase/types";
import type { ParentChildDashboardSummary } from "@/lib/parent-dashboard";

type Child = Database["public"]["Tables"]["children"]["Row"];

interface ChildSelectorProps {
  children?: Child[];
  summaries?: ParentChildDashboardSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function buildFallbackSummaries(children: Child[]): ParentChildDashboardSummary[] {
  return children.map((child) => ({
    childId: child.id,
    childName: child.name,
    avatar: child.avatar,
    completedCount: 0,
    totalCount: 0,
    todayPoints: 0,
    overdueCount: 0,
    makeupCount: 0,
    outstandingCount: 0,
    topNotice: "请查看今日详情",
  }));
}

export function ChildSelector({
  children,
  summaries,
  selectedId,
  onSelect,
}: ChildSelectorProps) {
  const cards = summaries ?? buildFallbackSummaries(children ?? []);
  const outstanding = cards.reduce((s, c) => s + c.outstandingCount, 0);

  const allSummary: ParentChildDashboardSummary = {
    childId: "__all__",
    childName: "全部孩子",
    avatar: "\u{1F98A}\u{1F98A}",
    completedCount: cards.reduce((s, c) => s + c.completedCount, 0),
    totalCount: cards.reduce((s, c) => s + c.totalCount, 0),
    todayPoints: cards.reduce((s, c) => s + c.todayPoints, 0),
    overdueCount: cards.reduce((s, c) => s + c.overdueCount, 0),
    makeupCount: cards.reduce((s, c) => s + c.makeupCount, 0),
    outstandingCount: outstanding,
    topNotice: outstanding > 0 ? `还有 ${outstanding} 项待完成` : "今天全部完成",
  };

  const allCards = [allSummary, ...cards];

  return (
    <nav role="tablist" aria-label="选择孩子" className="flex gap-1 overflow-x-auto pb-1 border-b-2 border-ink-200">
      {allCards.map((summary) => {
        const isActive = summary.childId === selectedId;
        const hasProgress = summary.totalCount > 0;
        return (
          <button
            key={summary.childId}
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(summary.childId)}
            className={[
              "flex shrink-0 items-center gap-1.5 rounded-t-radius-md px-space-3 py-space-2 text-left transition-colors duration-fast",
              isActive
                ? "relative -mb-[2px] border-b-2 border-forest-500 bg-white text-forest-700"
                : "text-ink-500 hover:bg-ink-50 hover:text-ink-700",
            ].join(" ")}
          >
            <span className="text-base leading-none">{summary.avatar || "\u{1F98A}"}</span>
            <span className="text-ui-sm font-medium truncate max-w-[80px]">{summary.childName}</span>
            {hasProgress && (
              <span className={[
                "rounded-full px-1.5 py-0.5 text-ui-xs font-medium",
                isActive ? "bg-forest-100 text-forest-600" : "bg-ink-100 text-ink-500",
              ].join(" ")}>
                {summary.completedCount}/{summary.totalCount}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
