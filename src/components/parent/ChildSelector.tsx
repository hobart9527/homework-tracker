"use client";

import type { Database } from "@/lib/supabase/types";
import { ChildSummaryCard } from "@/components/parent/ChildSummaryCard";
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

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((summary) => (
        <ChildSummaryCard
          key={summary.childId}
          summary={summary}
          selected={summary.childId === selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
