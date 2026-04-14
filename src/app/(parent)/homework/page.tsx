"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { buildHomeworkListView } from "@/lib/homework-list";
import { buildNewHomeworkHref } from "@/lib/homework-form";
import type { Database } from "@/lib/supabase/types";

type Homework = Database["public"]["Tables"]["homeworks"]["Row"];
type Child = Database["public"]["Tables"]["children"]["Row"];

export default function HomeworkListPage() {
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-2xl">🦊 加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary text-white p-4 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/dashboard">
            <span className="text-xl">←</span>
          </Link>
          <h1 className="text-xl font-bold">作业管理</h1>
          <Link href={buildNewHomeworkHref({ selectedChildId })}>
            <Button size="sm" variant="secondary">
              + 新建
            </Button>
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4">
        <div className="mb-4 rounded-2xl bg-white/80 px-4 py-3 text-sm text-forest-600">
          新建时可以一次分配给多个孩子，系统会分别创建独立作业，后续再按孩子单独调整。
        </div>
        {homeworks.length === 0 ? (
          <div className="text-center py-12">
            <span className="text-6xl">📝</span>
            <h2 className="text-xl font-bold text-forest-700 mt-4">
              还没有作业
            </h2>
            <p className="text-forest-500 mt-2">点击新建按钮添加第一个作业</p>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
            <aside className="rounded-3xl border border-forest-200 bg-white/90 p-4">
              <h2 className="text-sm font-semibold text-forest-700">查看范围</h2>
              <div className="mt-3 space-y-2">
                <button
                  type="button"
                  onClick={() => setSelectedChildId("all")}
                  className={`w-full rounded-2xl px-4 py-3 text-left transition-all ${
                    selectedChildId === "all"
                      ? "bg-primary/10 text-primary"
                      : "bg-forest-50 text-forest-600 hover:bg-forest-100"
                  }`}
                >
                  全部孩子
                </button>
                {children.map((child) => (
                  <button
                    key={child.id}
                    type="button"
                    onClick={() => setSelectedChildId(child.id)}
                    className={`w-full rounded-2xl px-4 py-3 text-left transition-all ${
                      selectedChildId === child.id
                        ? "bg-primary/10 text-primary"
                        : "bg-forest-50 text-forest-600 hover:bg-forest-100"
                    }`}
                  >
                    {child.avatar} {child.name}
                  </button>
                ))}
              </div>
            </aside>

            <div className="space-y-6">
              {listView.sections.map((section) => (
                <section key={section.title} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-forest-700">
                      {section.title}
                    </h2>
                    <span className="text-sm text-forest-400">
                      {section.items.length} 项
                    </span>
                  </div>

                  <div className="space-y-3">
                    {section.items.map((hw) => (
                      <Card key={hw.id}>
                        <div className="flex items-start gap-3">
                          <span className="text-3xl">{hw.type_icon}</span>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-forest-700">
                                {hw.title}
                              </h3>
                              <span className="text-xs text-forest-400">
                                {getChildName(hw.child_id)}
                              </span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-xs ${
                                  hw.isDueToday
                                    ? "bg-primary/10 text-primary"
                                    : "bg-forest-100 text-forest-500"
                                }`}
                              >
                                {hw.isDueToday ? "今天会出现" : "其他作业"}
                              </span>
                            </div>
                            <p className="mt-1 text-sm text-forest-500">
                              {hw.type_name} • {hw.point_value}积分
                            </p>
                            <p className="mt-1 text-xs text-forest-400">
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
                          <div className="flex gap-2">
                            <Link href={`/homework/new?copyFrom=${hw.id}`}>
                              <Button size="sm" variant="ghost">
                                复制
                              </Button>
                            </Link>
                            <Link href={`/homework/${hw.id}`}>
                              <Button size="sm" variant="ghost">
                                编辑
                              </Button>
                            </Link>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDelete(hw.id)}
                              className="text-red-500"
                            >
                              删除
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
      </main>
    </div>
  );
}
