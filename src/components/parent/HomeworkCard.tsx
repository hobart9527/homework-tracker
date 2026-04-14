"use client";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { Database } from "@/lib/supabase/types";

type Homework = Database["public"]["Tables"]["homeworks"]["Row"];
type CheckIn = Database["public"]["Tables"]["check_ins"]["Row"];

interface HomeworkCardProps {
  homework: Homework;
  checkIn?: CheckIn | null;
  onComplete?: () => void;
  onEdit?: () => void;
  isChildView?: boolean;
  statusText?: string;
  proofType?: "photo" | "audio" | null;
  awardedPoints?: number;
  scored?: boolean;
}

export function HomeworkCard({
  homework,
  checkIn,
  onComplete,
  onEdit,
  isChildView = false,
  statusText,
  proofType,
  awardedPoints,
  scored,
}: HomeworkCardProps) {
  const isCompleted = !!checkIn;
  const hasDetailMeta =
    statusText !== undefined ||
    proofType !== undefined ||
    awardedPoints !== undefined ||
    scored !== undefined;
  const isOverdue = !isCompleted && homework.daily_cutoff_time && new Date() > new Date(`1970-01-01T${homework.daily_cutoff_time}`);
  const detailProofLabel =
    proofType === "photo"
      ? "需要照片"
      : proofType === "audio"
        ? "需要录音"
        : null;
  const displayCompleted = hasDetailMeta
    ? (statusText ?? "").includes("完成")
    : isCompleted;

  return (
    <Card
      className={`${displayCompleted ? "opacity-75" : ""} ${isOverdue && !hasDetailMeta ? "border-2 border-accent" : ""}`}
    >
      <div className="flex items-start gap-3">
        <span className="text-3xl">{homework.type_icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-forest-700 truncate">
              {homework.title}
            </h3>
            {isOverdue && !hasDetailMeta && (
              <span className="px-2 py-0.5 text-xs bg-accent text-white rounded-full">
                逾期
              </span>
            )}
          </div>
          {homework.description && (
            <p className="text-sm text-forest-500 mt-1 line-clamp-2">
              {homework.description}
            </p>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs text-forest-400">
            <span>⏱️ {homework.estimated_minutes || 30} 分钟</span>
            <span>⭐ {homework.point_value} 积分</span>
            {homework.daily_cutoff_time && (
              <span>📍 截止 {homework.daily_cutoff_time}</span>
            )}
          </div>
          {hasDetailMeta && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              {detailProofLabel && (
                <span className="rounded-full bg-forest-100 px-2 py-1 text-forest-600">
                  {detailProofLabel}
                </span>
              )}
              {statusText && (
                <span className="rounded-full bg-primary/10 px-2 py-1 text-primary">
                  {statusText}
                </span>
              )}
              {scored ? (
                <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-700">
                  +{awardedPoints ?? 0} 分
                </span>
              ) : awardedPoints != null ? (
                <span className="rounded-full bg-forest-100 px-2 py-1 text-forest-500">
                  {awardedPoints} 分
                </span>
              ) : null}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          {hasDetailMeta ? null : isCompleted ? (
            <div className="flex items-center gap-1 text-primary">
              <span>✓</span>
              <span className="text-sm">已完成</span>
            </div>
          ) : isChildView ? (
            <Button size="sm" onClick={onComplete}>
              完成
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={onEdit}>
              编辑
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
