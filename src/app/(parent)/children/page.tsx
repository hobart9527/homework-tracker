"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useTranslation } from "@/hooks/useTranslation";
import type { Database } from "@/lib/supabase/types";

type Child = Database["public"]["Tables"]["children"]["Row"];

export default function ChildrenListPage() {
  const { t } = useTranslation();
  const supabase = createClient();
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchChildren = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-2xl">{t('common.loading')}</div>
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
          <h1 className="text-xl font-bold">{t('parent.children.title')}</h1>
          <Link href="/children/new">
            <Button size="sm" variant="secondary">
              + {t('common.add')}
            </Button>
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4">
        {children.length === 0 ? (
          <div className="text-center py-12">
            <span className="text-6xl">👶</span>
            <h2 className="text-xl font-bold text-forest-700 mt-4">
              {t('parent.children.noChildren')}
            </h2>
            <p className="text-forest-500 mt-2">{t('parent.children.addFirst')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {children.map((child) => (
              <Card key={child.id}>
                <div className="flex items-center gap-4">
                  <span className="text-4xl">{child.avatar || "🦊"}</span>
                  <div className="flex-1">
                    <h3 className="font-bold text-forest-700">{child.name}</h3>
                    <p className="text-sm text-forest-500">
                      {child.age}岁 •{" "}
                      {child.gender === "female" ? "女孩" : "男孩"}
                    </p>
                    <p className="text-sm text-primary">
                      ⭐ {child.points} 积分 • 🔥 {child.streak_days} 天连续
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost">
                      {t('common.edit')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(child.id)}
                      className="text-red-500"
                    >
                      {t('common.delete')}
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