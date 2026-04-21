"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

type VoicePushTaskStatus = {
  id: string;
  childName: string;
  homeworkTitle: string;
  status: "pending" | "retrying" | "sent" | "failed";
  deliveryAttempts: number;
  failureReason: string | null;
  lastAttemptedAt: string | null;
  sentAt: string | null;
};

interface VoicePushStatusPanelProps {
  tasks: VoicePushTaskStatus[];
  onRunQueue?: () => Promise<void>;
  lastRunSummary?: {
    processedCount: number;
    sentCount: number;
    retryingCount: number;
    failedCount: number;
    skippedCount: number;
  } | null;
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

function getStatusLabel(status: VoicePushTaskStatus["status"]) {
  if (status === "pending") {
    return "待发送";
  }

  if (status === "retrying") {
    return "重试中";
  }

  if (status === "sent") {
    return "已发送";
  }

  return "发送失败";
}

function getStatusClasses(status: VoicePushTaskStatus["status"]) {
  if (status === "pending") {
    return "bg-sky-100 text-sky-700";
  }

  if (status === "retrying") {
    return "bg-amber-100 text-amber-700";
  }

  if (status === "sent") {
    return "bg-emerald-100 text-emerald-700";
  }

  return "bg-rose-100 text-rose-700";
}

export function VoicePushStatusPanel({
  tasks,
  onRunQueue,
  lastRunSummary,
}: VoicePushStatusPanelProps) {
  const [runningQueue, setRunningQueue] = useState(false);
  const deliverableTaskCount = tasks.filter(
    (task) => task.status === "pending" || task.status === "retrying"
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-forest-700">语音桥接状态</h2>
          <p className="mt-1 text-sm text-forest-500">
            查看录音作业的桥接发送状态、失败原因和最近一次处理时间。
          </p>
        </div>

        {onRunQueue ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={runningQueue}
            onClick={async () => {
              setRunningQueue(true);
              try {
                await onRunQueue();
              } finally {
                setRunningQueue(false);
              }
            }}
          >
            {runningQueue
              ? "处理中..."
              : deliverableTaskCount > 0
                ? "处理发送队列"
                : "刷新队列"}
          </Button>
        ) : null}
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-forest-200 bg-forest-50 px-4 py-5 text-sm text-forest-500">
          还没有需要桥接发送的录音作业。
        </div>
      ) : (
        <div className="space-y-3">
          {lastRunSummary ? (
            <div className="rounded-2xl border border-forest-100 bg-white px-4 py-4 text-sm text-forest-600">
              <p className="font-semibold text-forest-700">最近一次处理结果</p>
              <p className="mt-1">
                已处理 {lastRunSummary.processedCount} 条，发送成功{" "}
                {lastRunSummary.sentCount} 条，等待重试{" "}
                {lastRunSummary.retryingCount} 条，发送失败{" "}
                {lastRunSummary.failedCount} 条，跳过{" "}
                {lastRunSummary.skippedCount} 条。
              </p>
            </div>
          ) : null}

          {tasks.map((task) => (
            <div
              key={task.id}
              className="rounded-2xl border border-forest-100 bg-forest-50/70 px-4 py-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-forest-700">
                    {task.childName}
                  </p>
                  <p className="text-sm text-forest-500">{task.homeworkTitle}</p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(
                    task.status
                  )}`}
                >
                  {getStatusLabel(task.status)}
                </span>
              </div>

              <div className="mt-3 space-y-1 text-sm text-forest-600">
                <p>已尝试发送：{task.deliveryAttempts} 次</p>
                {task.sentAt ? <p>发送成功：{formatTimestamp(task.sentAt)}</p> : null}
                {task.lastAttemptedAt ? (
                  <p>最近尝试：{formatTimestamp(task.lastAttemptedAt)}</p>
                ) : null}
                {task.failureReason ? (
                  <p className="text-rose-700">{task.failureReason}</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
