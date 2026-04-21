"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useTranslation } from "@/hooks/useTranslation";
import type { Database } from "@/lib/supabase/types";

type Parent = Database["public"]["Tables"]["parents"]["Row"];

export default function SettingsPage() {
  const { t } = useTranslation();
  const supabase = useMemo(() => createClient(), []);
  const [parent, setParent] = useState<Parent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }

      const { data: parentData } = await supabase
        .from("parents")
        .select("*")
        .eq("id", session.user.id)
        .single();

      if (parentData) {
        setParent(parentData);
      }
      setLoading(false);
    };

    fetchData();
  }, [supabase]);

  if (loading || !parent) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-2xl">{t("common.loading")}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary p-4 text-white">
        <div className="mx-auto flex max-w-3xl items-center gap-4">
          <Link href="/dashboard">
            <span className="text-xl">←</span>
          </Link>
          <div>
            <h1 className="text-xl font-bold">{t("parent.settings.title")}</h1>
            <p className="mt-1 text-sm text-white/80">
              先选对象，再配置功能。家庭级、孩子级、作业级和系统级入口已经分开整理。
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 p-4">
        <Card>
          <div className="space-y-3">
            <div>
              <h2 className="font-bold text-forest-700">设置导航</h2>
              <p className="mt-1 text-sm text-forest-500">
                不同对象的配置入口已经拆开，避免把家庭通道、孩子身份和作业规则混在同一个页面里。
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Link href="/settings/channels">
                <div className="rounded-2xl border border-forest-100 bg-forest-50/70 p-4 transition-colors hover:border-primary">
                  <h3 className="font-semibold text-forest-700">家庭通知通道</h3>
                  <p className="mt-1 text-sm text-forest-500">
                    Telegram、微信 bridge 与家庭级通知偏好
                  </p>
                </div>
              </Link>

              <Link href="/settings/integrations">
                <div className="rounded-2xl border border-forest-100 bg-forest-50/70 p-4 transition-colors hover:border-primary">
                  <h3 className="font-semibold text-forest-700">孩子集成</h3>
                  <p className="mt-1 text-sm text-forest-500">
                    学习平台账号与孩子默认消息路由
                  </p>
                </div>
              </Link>

              <Link href="/settings/system">
                <div className="rounded-2xl border border-forest-100 bg-forest-50/70 p-4 transition-colors hover:border-primary">
                  <h3 className="font-semibold text-forest-700">系统运行</h3>
                  <p className="mt-1 text-sm text-forest-500">
                    平台同步、语音桥接、失败重试与排障
                  </p>
                </div>
              </Link>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 font-bold text-forest-700">{t("parent.settings.profile")}</h2>
          <Button
            variant="ghost"
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/login";
            }}
          >
            {t("common.logout")}
          </Button>
        </Card>
      </main>
    </div>
  );
}
