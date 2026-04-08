"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import { ChildSelector } from "@/components/parent/ChildSelector";
import { TodayOverview } from "@/components/parent/TodayOverview";
import { Button } from "@/components/ui/Button";
import Link from "next/link";

type Child = Database["public"]["Tables"]["children"]["Row"];
type Homework = Database["public"]["Tables"]["homeworks"]["Row"];
type CheckIn = Database["public"]["Tables"]["check_ins"]["Row"];

export default function ParentDashboardPage() {
  const supabase = createClient();
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [homeworks, setHomeworks] = useState<
    (Homework & { check_ins: CheckIn[] | null })[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchChildren = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const { data: childrenData } = await supabase
        .from("children")
        .select("*")
        .eq("parent_id", session.user.id);

      if (childrenData && childrenData.length > 0) {
        setChildren(childrenData);
        setSelectedChildId(childrenData[0].id);
      }
      setLoading(false);
    };

    fetchChildren();
  }, [supabase]);

  useEffect(() => {
    if (!selectedChildId) return;

    const fetchHomeworks = async () => {
      const today = new Date().toISOString().split("T")[0];

      const { data: homeworksData } = await supabase
        .from("homeworks")
        .select("*, check_ins(*)")
        .eq("child_id", selectedChildId)
        .or(`repeat_start_date.lte.${today},repeat_start_date.is.null`)
        .or(`repeat_end_date.gte.${today},repeat_end_date.is.null`);

      if (homeworksData) {
        setHomeworks(homeworksData);
      }
    };

    fetchHomeworks();
  }, [selectedChildId, supabase]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-2xl">🦊 加载中...</div>
      </div>
    );
  }

  const selectedChild = children.find((c) => c.id === selectedChildId);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary text-white p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold">作业小管家</h1>
            <div className="flex gap-2">
              <Link href="/homework">
                <Button size="sm" variant="secondary">
                  作业管理
                </Button>
              </Link>
              <Link href="/children">
                <Button size="sm" variant="ghost">
                  孩子
                </Button>
              </Link>
            </div>
          </div>

          {children.length > 0 && (
            <ChildSelector
              children={children}
              selectedId={selectedChildId}
              onSelect={setSelectedChildId}
            />
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-4xl mx-auto p-4">
        {children.length === 0 ? (
          <div className="text-center py-12">
            <span className="text-6xl">🦊</span>
            <h2 className="text-xl font-bold text-forest-700 mt-4">
              还没有添加孩子
            </h2>
            <p className="text-forest-500 mt-2">
              点击下方按钮添加您的第一个孩子
            </p>
            <Link href="/children">
              <Button className="mt-4">添加孩子</Button>
            </Link>
          </div>
        ) : selectedChild ? (
          <TodayOverview homeworks={homeworks} child={selectedChild} />
        ) : null}
      </main>
    </div>
  );
}
