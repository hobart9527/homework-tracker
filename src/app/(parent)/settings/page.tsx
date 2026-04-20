"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PlatformSyncStatusPanel } from "@/components/parent/PlatformSyncStatusPanel";
import { ReminderSettings } from "@/components/parent/ReminderSettings";
import { QuickTypeManager } from "@/components/parent/QuickTypeManager";
import { useTranslation } from "@/hooks/useTranslation";
import type { Database } from "@/lib/supabase/types";

type Parent = Database["public"]["Tables"]["parents"]["Row"];
type CustomType = Database["public"]["Tables"]["custom_homework_types"]["Row"];
type Child = Database["public"]["Tables"]["children"]["Row"];
type PlatformAccount = Database["public"]["Tables"]["platform_accounts"]["Row"];
type PlatformSyncJob = Database["public"]["Tables"]["platform_sync_jobs"]["Row"];

export default function SettingsPage() {
  const { t } = useTranslation();
  const supabase = createClient();
  const [parent, setParent] = useState<Parent | null>(null);
  const [loading, setLoading] = useState(true);
  const [customTypes, setCustomTypes] = useState<CustomType[]>([]);
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
    }>
  >([]);

  const refreshPlatformAccounts = async (parentId: string) => {
    const { data: children } = await supabase
      .from("children")
      .select("*")
      .eq("parent_id", parentId);

    const childRows = (children ?? []) as Child[];

    if (!childRows.length) {
      setPlatformAccounts([]);
      return;
    }

    const childIds = childRows.map((child) => child.id);
    const childNameById = Object.fromEntries(
      childRows.map((child) => [child.id, child.name])
    );

    const { data: accounts } = await supabase
      .from("platform_accounts")
      .select("*")
      .in("child_id", childIds);

    const accountRows = (accounts ?? []) as PlatformAccount[];

    if (!accountRows.length) {
      setPlatformAccounts([]);
      return;
    }

    const accountIds = accountRows.map((account) => account.id);
    const { data: jobs } = await supabase
      .from("platform_sync_jobs")
      .select("*")
      .in("platform_account_id", accountIds)
      .order("created_at", { ascending: false });

    const latestRetryJobByAccountId = new Map<string, PlatformSyncJob>();

    for (const job of (jobs ?? []) as PlatformSyncJob[]) {
      if (
        job.status === "failed" &&
        job.next_retry_at &&
        !latestRetryJobByAccountId.has(job.platform_account_id)
      ) {
        latestRetryJobByAccountId.set(job.platform_account_id, job);
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
      }))
    );
  };

  useEffect(() => {
    const fetchParent = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const { data } = await supabase
        .from("parents")
        .select("*")
        .eq("id", session.user.id)
        .single();

      if (data) setParent(data);
      await refreshPlatformAccounts(session.user.id);
      setLoading(false);
    };

    fetchParent();
  }, [supabase]);

  useEffect(() => {
    const fetchTypes = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase
        .from("custom_homework_types")
        .select("*")
        .eq("parent_id", session.user.id);
      if (data) setCustomTypes(data);
    };
    fetchTypes();
  }, [supabase]);

  if (loading || !parent) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-2xl">{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary text-white p-4">
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <Link href="/dashboard">
            <span className="text-xl">←</span>
          </Link>
          <h1 className="text-xl font-bold">{t('parent.settings.title')}</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-4">
        <Card>
          <QuickTypeManager
            types={customTypes}
            onAdd={async (name, icon, points) => {
              const { data: { session } } = await supabase.auth.getSession();
              if (!session) return;
              const { data } = await supabase
                .from("custom_homework_types")
                .insert({ parent_id: session.user.id, name, icon, default_points: points })
                .select()
                .single();
              if (data) setCustomTypes((prev) => [...prev, data]);
            }}
            onUpdate={async (id, name, icon, points) => {
              await supabase.from("custom_homework_types").update({ name, icon, default_points: points }).eq("id", id);
              setCustomTypes((prev) => prev.map((t) => t.id === id ? { ...t, name, icon, default_points: points } : t));
            }}
            onDelete={async (id) => {
              await supabase.from("custom_homework_types").delete().eq("id", id);
              setCustomTypes((prev) => prev.filter((t) => t.id !== id));
            }}
          />
        </Card>

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

              await refreshPlatformAccounts(parent.id);
            }}
          />
        </Card>

        <Card>
          <h2 className="font-bold text-forest-700 mb-4">{t('parent.settings.notifications')}</h2>
          <ReminderSettings
            settings={parent}
            onUpdate={() => window.location.reload()}
          />
        </Card>

        <Card>
          <h2 className="font-bold text-forest-700 mb-4">{t('parent.settings.profile')}</h2>
          <Button
            variant="ghost"
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/login";
            }}
          >
            {t('common.logout')}
          </Button>
        </Card>
      </main>
    </div>
  );
}
