"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { buildHomeworkListView } from "@/lib/homework-list";
import { buildNewHomeworkHref } from "@/lib/homework-form";
import { useTranslation } from "@/hooks/useTranslation";
import type { Database } from "@/lib/supabase/types";

type Homework = Database["public"]["Tables"]["homeworks"]["Row"];
type Child = Database["public"]["Tables"]["children"]["Row"];

export default function HomeworkListPage() {
  const { t } = useTranslation();
  const [supabase] = useState(() => createClient());
  const [homeworks, setHomeworks] = useState<Homework[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const [{ data: childrenData }, { data: homeworksData }] =
        await Promise.all([
          supabase.from("children").select("*").eq("parent_id", session.user.id),
          supabase
            .from("homeworks")
            .select("*")
            .eq("created_by", session.user.id)
            .order("created_at", { ascending: false }),
        ]);

      if (childrenData) setChildren(childrenData);
      if (homeworksData) setHomeworks(homeworksData);
      setLoading(false);
    };

    fetchData();
  }, [supabase]);

  const getChildName = (childId: string) =>
    children.find((c) => c.id === childId)?.name || "未知";

  const listView = buildHomeworkListView(children, homeworks, {
    selectedChildId,
    date: new Date(),
  });

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除这个作业吗？")) return;
    await supabase.from("homeworks").delete().eq("id", id);
    setHomeworks((prev) => prev.filter((h) => h.id !== id));
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
      {homeworks.length === 0 ? (
          <div className="text-center py-12">
            <span className="text-6xl">📝</span>
            <h2 className="text-ui-xl font-ui-display font-bold text-forest-700 mt-space-4">
              {t('parent.homework.noHomework')}
            </h2>
            <p className="text-ink-500 mt-space-2">{t('parent.homework.createFirst')}</p>
          </div>
        ) : (
          <div className="grid gap-space-6 lg:grid-cols-[240px_minmax(0,1fr)]">
            <aside className="rounded-radius-xl border border-ink-200 bg-white p-space-4">
              <h2 className="text-ui-sm font-ui-display font-semibold text-forest-700">{t('parent.childSelector.selectChild')}</h2>
              <div className="mt-space-3 space-y-space-2">
                <button
                  type="button"
                  onClick={() => setSelectedChildId("all")}
                  className={`w-full rounded-radius-xl px-4 py-3 text-left transition-all ${
                    selectedChildId === "all"
                      ? "bg-forest-500/10 text-ink-600"
                      : "bg-ink-50 text-ink-600 hover:bg-ink-100"
                  }`}
                >
                  {t('parent.dashboard.allChildren')}
                </button>
                {children.map((child) => (
                  <button
                    key={child.id}
                    type="button"
                    onClick={() => setSelectedChildId(child.id)}
                    className={`w-full rounded-radius-xl px-4 py-3 text-left transition-all ${
                      selectedChildId === child.id
                        ? "bg-forest-500/10 text-ink-600"
                        : "bg-ink-50 text-ink-600 hover:bg-ink-100"
                    }`}
                  >
                    {child.avatar} {child.name}
                  </button>
                ))}
              </div>
            </aside>

            <div className="space-y-space-6">
              {listView.sections.map((section) => (
                <section key={section.title} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-ui-lg font-ui-display font-semibold text-forest-700">
                      {section.title}
                    </h2>
                    <span className="text-ui-sm text-ink-400">
                      {section.items.length} 项
                    </span>
                  </div>

                  <div className="space-y-3">
                    {section.items.map((hw) => (
                      <Card key={hw.id}>
                        <div className="flex items-start gap-3">
                          <span className="text-ui-3xl">{hw.type_icon}</span>
                          <div className="flex-1">
                            <div className="flex items-center gap-space-2">
                              <h3 className="font-semibold text-forest-700">
                                {hw.title}
                              </h3>
                              <span className="text-ui-xs text-ink-400">
                                {getChildName(hw.child_id)}
                              </span>
                              <span
                                className={`rounded-radius-sm px-2 py-0.5 text-ui-xs ${
                                  hw.isDueToday
                                    ? "bg-forest-500/10 text-ink-600"
                                    : "bg-forest-100 text-ink-500"
                                }`}
                              >
                                {hw.isDueToday ? "今天会出现" : "其他作业"}
                              </span>
                            </div>
                            <p className="mt-space-1 text-ui-sm text-ink-500">
                              {hw.type_name} • {hw.point_value}积分
                            </p>
                            <p className="mt-space-1 text-ui-xs text-ink-400">
                              {{
                                daily: "每日",
                                weekly: `每周${(hw.repeat_days || []).map((d) => "日一二三四五六"[d]).join("")}`,
                                interval: `每隔${hw.repeat_interval}天`,
                                once: "单次",
                              }[hw.repeat_type]}
                              {hw.daily_cutoff_time ? ` • 截止 ${hw.daily_cutoff_time}` : ""}
                              {hw.required_checkpoint_type
                                ? ` • 需要${hw.required_checkpoint_type === "photo" ? "照片" : "录音"}`
                                : ""}
                            </p>
                          </div>
                          <div className="flex gap-space-2">
                            <Link href={`/homework/new?copyFrom=${hw.id}`}>
                              <Button size="sm" variant="ghost">
                                复制
                              </Button>
                            </Link>
                            <Link href={`/homework/${hw.id}`}>
                              <Button size="sm" variant="ghost">
                                {t('common.edit')}
                              </Button>
                            </Link>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDelete(hw.id)}
                              className="text-coral-600"
                            >
                              {t('common.delete')}
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        )}
    </div>
  );
}
