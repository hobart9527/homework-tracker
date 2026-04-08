"use client";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { Database } from "@/lib/supabase/types";

type Homework = Database["public"]["Tables"]["homeworks"]["Row"];

interface ChildHomeworkCardProps {
  homework: Homework;
  isCompleted: boolean;
  isOverdue: boolean;
  onComplete: () => void;
}

export function ChildHomeworkCard({
  homework,
  isCompleted,
  isOverdue,
  onComplete,
}: ChildHomeworkCardProps) {
  return (
    <Card
      className={`${isCompleted ? "bg-forest-50 border-2 border-primary" : ""} ${
        isOverdue && !isCompleted ? "border-2 border-accent" : ""
      }`}
    >
      <div className="flex items-center gap-4">
        <span className="text-4xl">{homework.type_icon}</span>
        <div className="flex-1">
          <h3 className="font-semibold text-forest-700">{homework.title}</h3>
          <div className="flex items-center gap-3 mt-1 text-sm text-forest-500">
            <span>⏱️ {homework.estimated_minutes || 30}分钟</span>
            <span>⭐ {homework.point_value}积分</span>
          </div>
          {homework.daily_cutoff_time && (
            <p className="text-xs text-forest-400 mt-1">
              📍 截止 {homework.daily_cutoff_time}
            </p>
          )}
        </div>
        <div>
          {isCompleted ? (
            <div className="text-primary font-bold text-lg">✓ 完成</div>
          ) : isOverdue ? (
            <Button variant="accent" onClick={onComplete}>
              补打卡
            </Button>
          ) : (
            <Button onClick={onComplete}>完成</Button>
          )}
        </div>
      </div>
    </Card>
  );
}
