"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useTranslation } from "@/hooks/useTranslation";
import type { Database } from "@/lib/supabase/types";

type Child = Database["public"]["Tables"]["children"]["Row"];

export default function ChildrenListPage() {
  const { t } = useTranslation();
  const router = useRouter();
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
        <Card className="mb-space-4 border border-ink-300 bg-ink-50">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-bold text-forest-700">孩子相关集成</h2>
              <p className="text-ui-sm text-ink-500">
                这里管理孩子自己的学习平台账号和默认消息目标。家庭级的通知通道配置仍然统一放在设置页。
              </p>
            </div>
            <Button size="sm" onClick={() => router.push("/settings")}>前往家庭设置</Button>
          </div>
        </Card>

        {children.length === 0 ? (
          <div className="text-center py-12">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-16 h-16 mx-auto text-ink-300">
              <circle cx="12" cy="8" r="5" />
              <path d="M3 21v-2a7 7 0 0 1 7-7h4a7 7 0 0 1 7 7v2" />
            </svg>
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
                  <span className="text-4xl">
                    {child.avatar || <svg viewBox="0 0 24 24" fill="currentColor" className="w-9 h-9 inline-block"><path d="M12 2C9.5 2 7.5 4 7 6.5C5.5 6.5 4 8 4 10c0 1.5.8 2.8 2 3.5-1 1-1.5 2.5-1.5 4C4.5 19 6 21 8 21c1 0 1.8-.5 2.3-1.2L10 22h4l-.3-2.2C14.2 20.5 15 21 16 21c2 0 3.5-2 3.5-3.5 0-1.5-.5-3-1.5-4 1.2-.7 2-2 2-3.5 0-2-1.5-3.5-3-3.5C16.5 4 14.5 2 12 2zM9 10c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1zm6 0c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1z"/></svg>}
                  </span>
                  <div className="flex-1">
                    <h3 className="font-bold text-forest-700">{child.name}</h3>
                    <p className="text-ui-sm text-ink-500">
                      {child.age}岁 •{" "}
                      {child.gender === "female" ? "女孩" : "男孩"}
                    </p>
                    <p className="text-ui-sm text-ink-600">
                      <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 inline-block mr-0.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>{" "}
                      {child.points} 积分 •{" "}
                      <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 inline-block mr-0.5"><path d="M12 2c-1.5 3-4 5-5 8-1 3 0 6 2 8 1 1 2 2 3 2s2-1 3-2c2-2 3-5 2-8-1-3-3.5-5-5-8z" /></svg>{" "}
                      {child.streak_days} 天连续
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          router.push(
                            `/settings/integrations?childId=${child.id}#platform-binding`,
                          )
                        }
                      >
                        学习平台账号
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          router.push(
                            `/settings/integrations?childId=${child.id}#message-routing`,
                          )
                        }
                      >
                        默认消息路由
                      </Button>
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
