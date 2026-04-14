"use client";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { Database } from "@/lib/supabase/types";

type Homework = Database["public"]["Tables"]["homeworks"]["Row"];

interface ChildHomeworkCardProps {
  homework: Homework;
  isCompleted: boolean;
  isOverdue: boolean;
  isRepeatSubmission?: boolean;
  statusText?: string;
  onComplete: () => void;
}

export function ChildHomeworkCard({
  homework,
  isCompleted,
  isOverdue,
  isRepeatSubmission = false,
  statusText,
  onComplete,
}: ChildHomeworkCardProps) {
  const proofLabel = {
    photo: "照片",
    audio: "录音",
  } as const;

  return (
    <Card
      className={`${isCompleted ? "bg-forest-50 border-2 border-primary" : ""} ${
        isOverdue && !isCompleted ? "border-2 border-accent" : ""
      }`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 gap-4">
          <span className="text-4xl leading-none">{homework.type_icon}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate font-semibold text-forest-700">{homework.title}</h3>
              {isCompleted ? (
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  已完成
                </span>
              ) : isOverdue ? (
                <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-accent">
                  已超时
                </span>
              ) : (
                <span className="rounded-full bg-forest-100 px-2.5 py-0.5 text-xs font-medium text-forest-600">
                  待完成
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-forest-500">
              <span className="rounded-full bg-forest-50 px-3 py-1">⏱️ {homework.estimated_minutes || 30}分钟</span>
              <span className="rounded-full bg-forest-50 px-3 py-1">⭐ {homework.point_value}积分</span>
            </div>
            {homework.daily_cutoff_time && (
              <p className="mt-2 text-xs text-forest-400">📍 截止 {homework.daily_cutoff_time}</p>
            )}
            {homework.required_checkpoint_type && (
              <p className="mt-1 text-xs text-forest-400">需要{proofLabel[homework.required_checkpoint_type]}</p>
            )}
            {isRepeatSubmission && (
              <p className="mt-1 text-xs text-forest-400">再次提交不加分</p>
            )}
            {statusText && (
              <p className="mt-1 text-xs font-medium text-forest-500">{statusText}</p>
            )}
          </div>
        </div>
        <div className="sm:pt-1">
          {isCompleted ? (
            <div className="rounded-xl bg-primary/10 px-4 py-2 text-center text-lg font-bold text-primary">
              ✓ 完成
            </div>
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
