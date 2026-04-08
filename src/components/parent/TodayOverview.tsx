"use client";

import type { Database } from "@/lib/supabase/types";
import { HomeworkCard } from "@/components/parent/HomeworkCard";

type Homework = Database["public"]["Tables"]["homeworks"]["Row"];
type CheckIn = Database["public"]["Tables"]["check_ins"]["Row"];
type Child = Database["public"]["Tables"]["children"]["Row"];

interface TodayOverviewProps {
  homeworks: (Homework & { check_ins: CheckIn[] | null })[];
  child: Child;
}

export function TodayOverview({ homeworks, child }: TodayOverviewProps) {
  const today = new Date().getDay();

  // Filter homeworks for today based on repeat rules
  const todaysHomeworks = homeworks.filter((hw) => {
    if (!hw.is_active) return false;

    if (hw.repeat_type === "daily") return true;
    if (hw.repeat_type === "weekly") {
      return hw.repeat_days?.includes(today);
    }
    if (hw.repeat_type === "once") {
      const hwDate = new Date(hw.repeat_start_date || "").toDateString();
      return hwDate === new Date().toDateString();
    }
    return false;
  });

  const completedCount = todaysHomeworks.filter(
    (hw) => hw.check_ins && hw.check_ins.length > 0
  ).length;
  const totalCount = todaysHomeworks.length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-forest-700">
            {child.name} 的今日作业
          </h2>
          <p className="text-sm text-forest-500">
            {new Date().toLocaleDateString("zh-CN", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold text-primary">
            {completedCount}/{totalCount}
          </div>
          <p className="text-xs text-forest-500">已完成</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-3 bg-forest-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-500"
          style={{ width: `${totalCount ? (completedCount / totalCount) * 100 : 0}%` }}
        />
      </div>

      {/* Homework list */}
      <div className="space-y-3">
        {todaysHomeworks.length === 0 ? (
          <div className="text-center py-8 text-forest-400">
            <span className="text-4xl">🎉</span>
            <p className="mt-2">今天没有作业！</p>
          </div>
        ) : (
          todaysHomeworks.map((hw) => (
            <HomeworkCard
              key={hw.id}
              homework={hw}
              checkIn={hw.check_ins?.[0] || null}
            />
          ))
        )}
      </div>
    </div>
  );
}
