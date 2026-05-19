"use client";

import type { IncompleteHomework } from "@/lib/parent-dashboard";
import { Button } from "@/components/ui/Button";

interface IncompleteHomeworkAlertProps {
  items: IncompleteHomework[];
  onRemind?: (homeworkId: string, childId: string) => void;
}

function formatCutoff(cutoffTime: string | null): string {
  if (!cutoffTime) return "";
  return cutoffTime.slice(0, 5);
}

export function IncompleteHomeworkAlert({
  items,
  onRemind,
}: IncompleteHomeworkAlertProps) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-base font-semibold text-forest-800">未完成提醒</h2>
        <span
          className={
            items.length > 0
              ? "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-coral-50 px-1.5 text-xs font-medium text-coral-600"
              : "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-forest-100 px-1.5 text-xs font-medium text-forest-600"
          }
        >
          {items.length}
        </span>
      </div>

      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-forest-600">
          今天所有作业都完成了！🎉
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={`${item.homeworkId}-${item.childId}`}
              className="flex items-center gap-3 rounded-radius-lg border border-ink-300 bg-white p-3 shadow-elevation-raised"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-forest-50 text-base">
                {item.childAvatar || "\u{1F98A}"}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink-800">
                  {item.typeIcon ? `${item.typeIcon} ` : ""}{item.title}
                </p>
                <p className="text-xs text-ink-500">{item.childName}</p>
              </div>

              {item.cutoffTime && (
                <span
                  className={
                    item.isPastCutoff
                      ? "shrink-0 text-xs font-medium text-coral-600"
                      : "shrink-0 text-xs font-medium text-honey-600"
                  }
                >
                  {item.isPastCutoff
                    ? "已过截止时间"
                    : `截止 ${formatCutoff(item.cutoffTime)}`}
                </span>
              )}

              {onRemind && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onRemind(item.homeworkId, item.childId)}
                  className="shrink-0"
                >
                  提醒
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
