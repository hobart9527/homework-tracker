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
      <div className="py-12 text-center">
        <div className="text-ui-lg">{t("common.loading")}</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-space-6">
      <h1 className="text-ui-2xl font-ui-display font-bold text-forest-800">{t("parent.settings.title")}</h1>

      <Card>
        <div className="space-y-3">
          <div>
            <h2 className="font-bold text-forest-700">功能设置</h2>
            <p className="mt-1 text-ui-sm text-ink-500">
              按功能拆分为独立配置页，方便管理通知通道、学习平台路由和系统运维。
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Link href="/settings/channels" className="block rounded-radius-xl border border-ink-300 bg-white p-space-4 transition-colors hover:border-forest-400">
              <h3 className="font-semibold text-forest-700">通知通道</h3>
              <p className="mt-1 text-ui-sm text-ink-500">
                Telegram 与提醒偏好
              </p>
            </Link>

            <Link href="/settings/integrations" className="block rounded-radius-xl border border-ink-300 bg-white p-space-4 transition-colors hover:border-forest-400">
              <h3 className="font-semibold text-forest-700">学习平台与路由</h3>
              <p className="mt-1 text-ui-sm text-ink-500">
                绑定学习平台账号和管理消息路由
              </p>
            </Link>
          </div>
        </div>
      </Card>

      <Card>
        <div className="space-y-3">
          <div>
            <h2 className="font-bold text-forest-700">阅读内容管理</h2>
            <p className="mt-1 text-ui-sm text-ink-500">
              查看内容生产状态、管理抓取来源和文章储备。
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Link href="/settings/reading" className="block rounded-radius-xl border border-ink-300 bg-white p-space-4 transition-colors hover:border-forest-400">
              <h3 className="font-semibold text-forest-700">内容概览</h3>
              <p className="mt-1 text-ui-sm text-ink-500">
                文章总数、话题活跃度、生成历史
              </p>
            </Link>

            <Link href="/settings/reading/sources" className="block rounded-radius-xl border border-ink-300 bg-white p-space-4 transition-colors hover:border-forest-400">
              <h3 className="font-semibold text-forest-700">抓取源管理</h3>
              <p className="mt-1 text-ui-sm text-ink-500">
                管理内容来源和抓取配置
              </p>
            </Link>

            <Link href="/settings/reading-standards" className="block rounded-radius-xl border border-ink-300 bg-white p-space-4 transition-colors hover:border-forest-400">
              <h3 className="font-semibold text-forest-700">等级标准</h3>
              <p className="mt-1 text-ui-sm text-ink-500">
                各年级字数、难度、RAZ 对标
              </p>
            </Link>

            <Link href="/settings/system" className="block rounded-radius-xl border border-ink-300 bg-white p-space-4 transition-colors hover:border-forest-400">
              <h3 className="font-semibold text-forest-700">系统运维</h3>
              <p className="mt-1 text-ui-sm text-ink-500">
                平台同步、内容刷新、语音推送
              </p>
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
          退出登录
        </Button>
      </Card>
    </div>
  );
}