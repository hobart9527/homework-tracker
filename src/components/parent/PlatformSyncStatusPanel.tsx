"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

type PlatformSyncAccountStatus = {
  id: string;
  childName: string;
  platform: string;
  externalAccountRef: string;
  status: "active" | "failed" | "attention_required" | "syncing";
  lastSyncedAt: string | null;
  lastSyncErrorSummary: string | null;
  nextRetryAt: string | null;
  recentActivities: Array<{
    id: string;
    title: string;
    occurredAt: string;
  }>;
};

interface PlatformSyncStatusPanelProps {
  accounts: PlatformSyncAccountStatus[];
  onRetry?: (platformAccountId: string) => Promise<void>;
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getStatusLabel(status: PlatformSyncAccountStatus["status"]) {
  if (status === "active") {
    return "运行正常";
  }

  if (status === "failed") {
    return "等待重试";
  }

  if (status === "attention_required") {
    return "需要处理";
  }

  return "同步中";
}

function getStatusClasses(status: PlatformSyncAccountStatus["status"]) {
  if (status === "active") {
    return "bg-emerald-100 text-emerald-700";
  }

  if (status === "failed") {
    return "bg-amber-100 text-amber-700";
  }

  if (status === "attention_required") {
    return "bg-rose-100 text-rose-700";
  }

  return "bg-sky-100 text-sky-700";
}

export function PlatformSyncStatusPanel({
  accounts,
  onRetry,
}: PlatformSyncStatusPanelProps) {
  const [retryingAccountId, setRetryingAccountId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-bold text-forest-700">平台同步状态</h2>
        <p className="mt-1 text-sm text-forest-500">
          查看每个孩子的平台连接、最近失败原因和下一次重试时间。
        </p>
      </div>

      {accounts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-forest-200 bg-forest-50 px-4 py-5 text-sm text-forest-500">
          还没有绑定任何学习平台账号。
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="rounded-2xl border border-forest-100 bg-forest-50/70 px-4 py-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-forest-700">
                    {account.childName}
                  </p>
                  <p className="text-sm text-forest-500">
                    {account.platform} · {account.externalAccountRef}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(
                    account.status
                  )}`}
                >
                  {getStatusLabel(account.status)}
                </span>
              </div>

              <div className="mt-3 space-y-1 text-sm text-forest-600">
                {account.lastSyncedAt ? (
                  <p>最近同步：{formatTimestamp(account.lastSyncedAt)}</p>
                ) : null}
                {account.nextRetryAt ? (
                  <p>下次重试：{formatTimestamp(account.nextRetryAt)}</p>
                ) : null}
                {account.lastSyncErrorSummary ? (
                  <p className="text-rose-700">{account.lastSyncErrorSummary}</p>
                ) : null}
              </div>

              {account.recentActivities.length ? (
                <div className="mt-4 rounded-xl bg-white/80 px-3 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-forest-400">
                    最近内容
                  </p>
                  <ul className="mt-2 space-y-2 text-sm text-forest-600">
                    {account.recentActivities.map((activity) => (
                      <li key={activity.id} className="flex items-start justify-between gap-3">
                        <span className="line-clamp-2">{activity.title}</span>
                        <span className="shrink-0 text-xs text-forest-400">
                          {formatTimestamp(activity.occurredAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {onRetry &&
              (account.status === "failed" ||
                account.status === "attention_required") ? (
                <div className="mt-4">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={retryingAccountId === account.id}
                    onClick={async () => {
                      setRetryingAccountId(account.id);
                      try {
                        await onRetry(account.id);
                      } finally {
                        setRetryingAccountId(null);
                      }
                    }}
                  >
                    {retryingAccountId === account.id ? "重试中..." : "立即重试"}
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
