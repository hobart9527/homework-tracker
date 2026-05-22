"use client";

import React from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { IconStar, IconMapPin, IconClock } from "@/components/ui/icons";
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
  actionButtons?: React.ReactNode;
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
  actionButtons,
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
      className={`${displayCompleted ? "opacity-75" : ""} ${isOverdue && !hasDetailMeta ? "border-2 border-coral-500" : ""}`}
    >
      <div className="flex items-start gap-3">
        <span className="text-3xl">{homework.type_icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-forest-700 truncate">
              {homework.title}
            </h3>
            {isOverdue && !hasDetailMeta && (
              <span className="px-2 py-0.5 text-ui-xs bg-coral-500 text-white rounded-full">
                逾期
              </span>
            )}
          </div>
          {homework.description && (
            <p className="text-ui-sm text-ink-500 mt-space-1 line-clamp-2">
              {homework.description}
            </p>
          )}
          <div className="flex items-center gap-3 mt-2 text-ui-xs text-ink-400">
            {homework.estimated_minutes != null ? (
              <span className="inline-flex items-center gap-0.5"><IconClock className="w-3 h-3" /> {homework.estimated_minutes} 分钟</span>
            ) : null}
            <span className="inline-flex items-center gap-0.5"><IconStar className="w-3 h-3" /> {homework.point_value} 积分</span>
            {homework.daily_cutoff_time && (
              <span className="inline-flex items-center gap-0.5"><IconMapPin className="w-3 h-3" /> 截止 {homework.daily_cutoff_time}</span>
            )}
          </div>
          {hasDetailMeta && (
            <div className="mt-space-3 flex flex-wrap items-center gap-2 text-ui-xs">
              {detailProofLabel && (
                <span className="rounded-full bg-ink-100 px-2 py-1 text-ink-600">
                  {detailProofLabel}
                </span>
              )}
              {statusText && (
                <span className="rounded-full bg-forest-500/10 px-2 py-1 text-forest-600">
                  {statusText}
                </span>
              )}
              {scored ? (
                <span className="rounded-full bg-success-100 px-2 py-1 text-success-700">
                  +{awardedPoints ?? 0} 分
                </span>
              ) : awardedPoints != null ? (
                <span className="rounded-full bg-ink-100 px-2 py-1 text-ink-500">
                  {awardedPoints} 分
                </span>
              ) : null}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2 items-end">
          {hasDetailMeta ? actionButtons : isCompleted ? (
            <div className="flex items-center gap-1 text-forest-600">
              <span>✓</span>
              <span className="text-ui-sm">已完成</span>
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
