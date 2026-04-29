"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SettingsShell } from "@/components/parent/SettingsShell";
import { Card } from "@/components/ui/Card";
import { PlatformSyncStatusPanel } from "@/components/parent/PlatformSyncStatusPanel";
import { VoicePushStatusPanel } from "@/components/parent/VoicePushStatusPanel";
import type { Database } from "@/lib/supabase/types";

type Child = Database["public"]["Tables"]["children"]["Row"];
type Homework = Database["public"]["Tables"]["homeworks"]["Row"];
type PlatformAccount = Database["public"]["Tables"]["platform_accounts"]["Row"];
type PlatformSyncJob = Database["public"]["Tables"]["platform_sync_jobs"]["Row"];
type LearningEvent = Database["public"]["Tables"]["learning_events"]["Row"];
type VoicePushTask = Database["public"]["Tables"]["voice_push_tasks"]["Row"];

export default function SettingsSystemPage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [parentId, setParentId] = useState<string | null>(null);
  const [platformAccounts, setPlatformAccounts] = useState<
    Array<{
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
    }>
  >([]);
  const [voicePushTasks, setVoicePushTasks] = useState<
    Array<{
      id: string;
      childName: string;
      homeworkTitle: string;
      status: "pending" | "retrying" | "sent" | "failed";
      deliveryAttempts: number;
      failureReason: string | null;
      lastAttemptedAt: string | null;
      sentAt: string | null;
    }>
  >([]);
  const [voicePushRunSummary, setVoicePushRunSummary] = useState<{
    processedCount: number;
    sentCount: number;
    retryingCount: number;
    failedCount: number;
    skippedCount: number;
  } | null>(null);

  const refreshStatus = async (nextParentId: string) => {
    const { data: children } = await supabase
      .from("children")
      .select("*")
      .eq("parent_id", nextParentId);

    const childRows = (children ?? []) as Child[];
    if (!childRows.length) {
      setPlatformAccounts([]);
      setVoicePushTasks([]);
      return;
    }

    const childIds = childRows.map((child) => child.id);
    const childNameById = Object.fromEntries(
      childRows.map((child) => [child.id, child.name])
    );

    const [{ data: accounts }, { data: homeworks }, { data: tasks }] = await Promise.all([
      supabase.from("platform_accounts").select("*").in("child_id", childIds),
      supabase.from("homeworks").select("*").in("child_id", childIds),
      supabase
        .from("voice_push_tasks")
        .select("*")
      .in("child_id", childIds)
      .order("created_at", { ascending: false })
      .limit(10),
    ]);

    const accountRows = (accounts ?? []) as PlatformAccount[];
    const homeworkTitleById = Object.fromEntries(
      ((homeworks ?? []) as Homework[]).map((homework) => [
        homework.id,
        homework.title,
      ])
    );

    if (!accountRows.length) {
      setPlatformAccounts([]);
    } else {
      const accountIds = accountRows.map((account) => account.id);
      const [{ data: jobs }, { data: events }] = await Promise.all([
        supabase
          .from("platform_sync_jobs")
          .select("*")
          .in("platform_account_id", accountIds)
          .order("created_at", { ascending: false }),
        supabase
          .from("learning_events")
          .select("*")
          .in("platform_account_id", accountIds)
          .order("occurred_at", { ascending: false })
          .limit(30),
      ]);

      const latestRetryJobByAccountId = new Map<string, PlatformSyncJob>();
      const recentActivitiesByAccountId = new Map<
        string,
        Array<{
          id: string;
          title: string;
          occurredAt: string;
        }>
      >();

      for (const job of (jobs ?? []) as PlatformSyncJob[]) {
        if (
          job.status === "failed" &&
          job.next_retry_at &&
          !latestRetryJobByAccountId.has(job.platform_account_id)
        ) {
          latestRetryJobByAccountId.set(job.platform_account_id, job);
        }
      }

      for (const event of (events ?? []) as LearningEvent[]) {
        const recentActivities =
          recentActivitiesByAccountId.get(event.platform_account_id) ?? [];

        if (recentActivities.length < 3) {
          recentActivities.push({
            id: event.id,
            title: event.title,
            occurredAt: event.occurred_at,
          });
          recentActivitiesByAccountId.set(event.platform_account_id, recentActivities);
        }
      }

      setPlatformAccounts(
        accountRows.map((account) => ({
          id: account.id,
          childName: childNameById[account.child_id] ?? "未命名孩子",
          platform: account.platform,
          externalAccountRef: account.external_account_ref,
          status: account.status,
          lastSyncedAt: account.last_synced_at,
          lastSyncErrorSummary: account.last_sync_error_summary,
          nextRetryAt:
            latestRetryJobByAccountId.get(account.id)?.next_retry_at ?? null,
          recentActivities: recentActivitiesByAccountId.get(account.id) ?? [],
        }))
      );
    }

    setVoicePushTasks(
      ((tasks ?? []) as VoicePushTask[]).map((task) => ({
        id: task.id,
        childName: childNameById[task.child_id] ?? "未命名孩子",
        homeworkTitle: homeworkTitleById[task.homework_id] ?? "录音作业",
        status: task.status,
        deliveryAttempts: task.delivery_attempts,
        failureReason: task.failure_reason,
        lastAttemptedAt: task.last_attempted_at,
        sentAt: task.sent_at,
      }))
    );
  };

  useEffect(() => {
    const fetchData = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }

      setParentId(session.user.id);
      await refreshStatus(session.user.id);
      setLoading(false);
    };

    fetchData();
  }, [supabase]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-2xl">加载中...</div>
      </div>
    );
  }

  return (
    <SettingsShell
      title="系统运行"
      description="这里只看运行状态、失败重试和人工排障，不承载家庭级或孩子级配置。"
    >
      <Card>
        <PlatformSyncStatusPanel
          accounts={platformAccounts}
          onRetry={async (platformAccountId) => {
            await fetch("/api/platform-sync/import", {
              method: "POST",
              headers: {
                "content-type": "application/json",
              },
              body: JSON.stringify({
                platformAccountId,
                fetchMode: "managed_session",
              }),
            });

            if (parentId) {
              await refreshStatus(parentId);
            }
          }}
        />
      </Card>

      <Card id="voice-push-status" className="scroll-mt-4">
        <VoicePushStatusPanel
          tasks={voicePushTasks}
          lastRunSummary={voicePushRunSummary}
          onRunQueue={async () => {
            const response = await fetch("/api/voice-push/run", {
              method: "GET",
            });
            const body = await response.json();

            if (response.ok) {
              setVoicePushRunSummary({
                processedCount: Number(body.processedCount ?? 0),
                sentCount: Number(body.sentCount ?? 0),
                retryingCount: Number(body.retryingCount ?? 0),
                failedCount: Number(body.failedCount ?? 0),
                skippedCount: Number(body.skippedCount ?? 0),
              });
            } else {
              setVoicePushRunSummary({
                processedCount: 0,
                sentCount: 0,
                retryingCount: 0,
                failedCount: 1,
                skippedCount: 0,
              });
            }

            if (parentId) {
              await refreshStatus(parentId);
            }
          }}
        />
      </Card>
    </SettingsShell>
  );
}
