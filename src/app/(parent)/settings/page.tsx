"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useTranslation } from "@/hooks/useTranslation";
import type { Database } from "@/lib/supabase/types";

type Parent = Database["public"]["Tables"]["parents"]["Row"];

type Child = Database["public"]["Tables"]["children"]["Row"] & {
  reading_grade_level: number | null;
};

export default function SettingsPage() {
  const { t } = useTranslation();
  const supabase = useMemo(() => createClient(), []);
  const [parent, setParent] = useState<Parent | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
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

      const { data: childrenData } = await supabase
        .from("children")
        .select("*")
        .eq("parent_id", session.user.id);
      if (childrenData) setChildren(childrenData as Child[]);

      setLoading(false);
    };

    fetchData();
  }, [supabase]);

  const handleUpdateReadingGrade = async (childId: string, grade: number) => {
    // Optimistic update
    setChildren((prev) =>
      prev.map((c) =>
        c.id === childId ? { ...c, reading_grade_level: grade } : c,
      ),
    );

    // Persist to DB
    const { error } = await supabase
      .from("children")
      .update({ reading_grade_level: grade })
      .eq("id", childId);

    if (error) {
      // Revert on error: re-fetch children from server
      const { data: sessionData } = await supabase.auth.getSession();
      const pid = sessionData.session?.user.id;
      if (pid) {
        const { data } = await supabase
          .from("children")
          .select("*")
          .eq("parent_id", pid);
        if (data) setChildren(data as Child[]);
      }
    }
  };

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
            <h2 className="font-bold text-forest-700">设置导航</h2>
            <p className="mt-1 text-ui-sm text-ink-500">
              不同对象的配置入口已经拆开，避免把家庭通道、孩子身份和作业规则混在同一个页面里。
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Link href="/settings/channels" className="block rounded-radius-xl border border-ink-300 bg-white p-space-4 transition-colors hover:border-forest-400">
              <h3 className="font-semibold text-forest-700">家庭通知通道</h3>
              <p className="mt-1 text-ui-sm text-ink-500">
                Telegram、微信 bridge 与家庭级通知偏好
              </p>
            </Link>

            <Link href="/settings/integrations" className="block rounded-radius-xl border border-ink-300 bg-white p-space-4 transition-colors hover:border-forest-400">
              <h3 className="font-semibold text-forest-700">孩子集成</h3>
              <p className="mt-1 text-ui-sm text-ink-500">
                学习平台账号与孩子默认消息路由
              </p>
            </Link>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 font-bold text-forest-700">阅读等级设置</h2>
        <p className="mb-4 text-ui-sm text-ink-500">
          为每个孩子单独设置英文阅读等级（Grade 1-12），默认与孩子年级一致。
        </p>
        <div className="space-y-3">
          {children.map((child) => (
            <div
              key={child.id}
              className="flex items-center justify-between rounded-radius-lg bg-ink-50 p-3"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{child.avatar || "🦊"}</span>
                <div>
                  <span className="font-medium text-forest-700">
                    {child.name}
                  </span>
                </div>
              </div>
              <select
                value={child.reading_grade_level ?? 3}
                onChange={(e) =>
                  handleUpdateReadingGrade(child.id, parseInt(e.target.value))
                }
                className="rounded-radius-md border border-ink-300 bg-white px-3 py-1.5 text-ui-sm text-forest-700 focus:border-forest-500 focus:outline-none"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((g) => (
                  <option key={g} value={g}>
                    Grade {g}
                  </option>
                ))}
              </select>
            </div>
          ))}
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
    </div>
  );
}