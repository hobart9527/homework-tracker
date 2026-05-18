"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useTranslation } from "@/hooks/useTranslation";
import type { Database } from "@/lib/supabase/types";

type Child = Database["public"]["Tables"]["children"]["Row"];

export default function ChildrenListPage() {
  const { t } = useTranslation();
  const supabase = useMemo(() => createClient(), []);
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchChildren = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("children")
        .select("*")
        .eq("parent_id", session.user.id);

      if (data) setChildren(data);
      setLoading(false);
    };

    fetchChildren();
  }, [supabase]);

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除这个孩子吗？所有相关作业和记录也会被删除。")) return;
    await supabase.from("children").delete().eq("id", id);
    setChildren((prev) => prev.filter((c) => c.id !== id));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-ui-lg">{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-space-6">
        <Card className="mb-4 border border-ink-200 bg-ink-50">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-bold text-forest-700">孩子相关集成</h2>
              <p className="text-ui-sm text-ink-500">
                这里管理孩子自己的学习平台账号和默认消息目标。家庭级的通知通道配置仍然统一放在设置页。
              </p>
            </div>
            <Link href="/settings">
              <Button size="sm">前往家庭设置</Button>
            </Link>
          </div>
        </Card>

        {children.length === 0 ? (
          <div className="text-center py-12">
            <span className="text-6xl">👶</span>
            <h2 className="text-ui-xl font-ui-display font-bold text-forest-700 mt-4">
              {t('parent.children.noChildren')}
            </h2>
            <p className="text-ink-500 mt-2">{t('parent.children.addFirst')}</p>
          </div>
        ) : (
          <div className="space-y-space-3">
            {children.map((child) => (
              <Card key={child.id}>
                <div className="flex items-center gap-4">
                  <span className="text-4xl">{child.avatar || "🦊"}</span>
                  <div className="flex-1">
                    <h3 className="font-bold text-forest-700">{child.name}</h3>
                    <p className="text-ui-sm text-ink-500">
                      {child.age}岁 •{" "}
                      {child.gender === "female" ? "女孩" : "男孩"}
                    </p>
                    <p className="text-ui-sm text-ink-600">
                      ⭐ {child.points} 积分 • 🔥 {child.streak_days} 天连续
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href={`/settings/integrations?childId=${child.id}#platform-binding`}
                      >
                        <Button size="sm" variant="secondary">
                          学习平台账号
                        </Button>
                      </Link>
                      <Link
                        href={`/settings/integrations?childId=${child.id}#message-routing`}
                      >
                        <Button size="sm" variant="ghost">
                          默认消息路由
                        </Button>
                      </Link>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost">
                      {t('common.edit')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(child.id)}
                      className="text-coral-600"
                    >
                      {t('common.delete')}
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
  );
}
