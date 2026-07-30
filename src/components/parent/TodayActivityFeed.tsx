"use client";

import type { RecentCheckIn } from "@/lib/parent-dashboard";

interface TodayActivityFeedProps {
  checkIns: RecentCheckIn[];
  compact?: boolean;
}

const PLATFORM_LABELS: Record<string, string> = {
  ixl: "IXL",
  "khan-academy": "可汗学院",
  "raz-kids": "Raz-Kids",
  epic: "Epic",
};

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  } catch {
    return "--:--";
  }
}

export function TodayActivityFeed({ checkIns, compact }: TodayActivityFeedProps) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-base font-semibold text-forest-800">今日打卡动态</h2>
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-forest-100 px-1.5 text-xs font-medium text-forest-600">
          {checkIns.length}
        </span>
      </div>

      {checkIns.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-400">
          今天还没有打卡记录
        </p>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-1">
          <div className="flex gap-3" style={{ minWidth: "min-content" }}>
            {checkIns.map((ci) =>
              compact ? (
                <div
                  key={ci.checkInId}
                  className="flex w-36 flex-shrink-0 flex-col gap-1 rounded-radius-lg border border-ink-300 bg-white p-space-2 shadow-elevation-raised"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-ui-xs text-ink-400">
                      {formatTime(ci.completedAt)}
                    </span>
                    {ci.proofType && (
                      <span className="text-ui-xs">
                        {ci.proofType === "photo" ? "\u{1F4F8}" : "\u{1F3B5}"}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-forest-50 text-xs">
                      {ci.childAvatar || "\u{1F98A}"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-ink-800">
                        {ci.typeIcon ? `${ci.typeIcon} ` : ""}{ci.homeworkTitle}
                      </p>
                      <p className="text-ui-xs text-ink-500">{ci.childName}</p>
                      {ci.autoSource ? (
                        <p className="truncate text-ui-xs text-forest-500">
                          {"\u{1F916}"} 来自 {PLATFORM_LABELS[ci.autoSource.platform] ?? ci.autoSource.platform} · {ci.autoSource.title}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-center">
                    <span className="rounded-full bg-honey-50 px-1.5 py-0 text-ui-xs font-medium text-honey-600">
                      +{ci.points} 分
                    </span>
                  </div>
                </div>
              ) : (
                <div
                  key={ci.checkInId}
                  className="flex w-48 flex-shrink-0 flex-col gap-2 rounded-radius-lg border border-ink-300 bg-white p-3 shadow-elevation-raised"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-ui-xs text-ink-400">
                      {formatTime(ci.completedAt)}
                    </span>
                    {ci.proofType && (
                      <span className="text-ui-xs" aria-label={ci.proofType === "photo" ? "照片" : "录音"}>
                        {ci.proofType === "photo" ? "\u{1F4F8}" : "\u{1F3B5}"}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-forest-50 text-ui-sm">
                      {ci.childAvatar || "\u{1F98A}"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-ui-sm font-medium text-ink-800">
                        {ci.typeIcon ? `${ci.typeIcon} ` : ""}{ci.homeworkTitle}
                      </p>
                      <p className="text-ui-xs text-ink-500">{ci.childName}</p>
                      {ci.autoSource ? (
                        <p className="truncate text-ui-xs text-forest-500">
                          {"\u{1F916}"} 来自 {PLATFORM_LABELS[ci.autoSource.platform] ?? ci.autoSource.platform} · {ci.autoSource.title}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-center">
                    <span className="rounded-full bg-honey-50 px-2 py-0.5 text-ui-xs font-medium text-honey-600">
                      +{ci.points} 分
                    </span>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </section>
  );
}
