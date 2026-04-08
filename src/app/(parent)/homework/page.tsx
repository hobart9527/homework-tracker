"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { Database } from "@/lib/supabase/types";

type Homework = Database["public"]["Tables"]["homeworks"]["Row"];
type Child = Database["public"]["Tables"]["children"]["Row"];

export default function HomeworkListPage() {
  const supabase = createClient();
  const [homeworks, setHomeworks] = useState<Homework[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
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
          <Link href="/homework/new">
            <Button size="sm" variant="secondary">
              + 新建
            </Button>
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4">
        {homeworks.length === 0 ? (
          <div className="text-center py-12">
            <span className="text-6xl">📝</span>
            <h2 className="text-xl font-bold text-forest-700 mt-4">
              还没有作业
            </h2>
            <p className="text-forest-500 mt-2">点击新建按钮添加第一个作业</p>
          </div>
        ) : (
          <div className="space-y-3">
            {homeworks.map((hw) => (
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
                    </div>
                    <p className="text-sm text-forest-500 mt-1">
                      {hw.type_name} • {hw.point_value}积分
                    </p>
                    <p className="text-xs text-forest-400 mt-1">
                      {{
                        daily: "每日",
                        weekly: `每周${(hw.repeat_days || []).map((d) => "日一二三四五六"[d]).join("")}`,
                        interval: `每隔${hw.repeat_interval}天`,
                        once: "单次",
                      }[hw.repeat_type]}
                    </p>
                  </div>
                  <div className="flex gap-2">
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
        )}
      </main>
    </div>
  );
}