"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import { ChildHomeworkCard } from "@/components/child/ChildHomeworkCard";
import { CheckInModal } from "@/components/child/CheckInModal";

type Homework = Database["public"]["Tables"]["homeworks"]["Row"];
type CheckIn = Database["public"]["Tables"]["check_ins"]["Row"];

export default function ChildTodayPage() {
  const supabase = createClient();
  const [homeworks, setHomeworks] = useState<Homework[]>([]);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [selectedHomework, setSelectedHomework] = useState<Homework | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    const today = new Date().toISOString().split("T")[0];
    const dayOfWeek = new Date().getDay();

    const { data: homeworksData } = await supabase
      .from("homeworks")
      .select("*")
      .eq("child_id", session.user.id)
      .eq("is_active", true);

    // Filter homeworks for today
    const todaysHomeworks = (homeworksData || []).filter((hw) => {
      if (hw.repeat_type === "daily") return true;
      if (hw.repeat_type === "weekly") {
        return hw.repeat_days?.includes(dayOfWeek);
      }
      if (hw.repeat_type === "once") {
        return hw.repeat_start_date === today;
      }
      return false;
    });

    const { data: checkInsData } = await supabase
      .from("check_ins")
      .select("*")
      .eq("child_id", session.user.id)
      .gte("completed_at", `${today}T00:00:00`)
      .lte("completed_at", `${today}T23:59:59`);

    setHomeworks(todaysHomeworks);
    setCheckIns(checkInsData || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [supabase]);

  const isCompleted = (hwId: string) =>
    checkIns.some((ci) => ci.homework_id === hwId);

  const isOverdue = (hw: Homework) => {
    if (!hw.daily_cutoff_time) return false;
    const now = new Date();
    const [hours, minutes] = hw.daily_cutoff_time.split(":").map(Number);
    const cutoff = new Date();
    cutoff.setHours(hours, minutes, 0, 0);
    return now > cutoff;
  };

  const completedCount = homeworks.filter((hw) => isCompleted(hw.id)).length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-2xl">🦊 加载中...</div>
      </div>
    );
  }

  return (
    <main className="max-w-2xl mx-auto p-4">
      {/* Progress */}
      <div className="bg-white rounded-2xl shadow-md p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-forest-700">今日进度</h2>
          <span className="text-primary font-bold">
            {completedCount}/{homeworks.length}
          </span>
        </div>
        <div className="h-3 bg-forest-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{
              width: `${
                homeworks.length
                  ? (completedCount / homeworks.length) * 100
                  : 0
              }%`,
            }}
          />
        </div>
        {completedCount === homeworks.length && homeworks.length > 0 && (
          <p className="text-center text-primary mt-2 font-bold">🎉 太棒了！今日作业全部完成！</p>
        )}
      </div>

      {/* Homework list */}
      <div className="space-y-3">
        {homeworks.length === 0 ? (
          <div className="text-center py-12">
            <span className="text-6xl">🎉</span>
            <h2 className="text-xl font-bold text-forest-700 mt-4">
              今天没有作业！
            </h2>
            <p className="text-forest-500 mt-2">好好休息吧～</p>
          </div>
        ) : (
          homeworks.map((hw) => (
            <ChildHomeworkCard
              key={hw.id}
              homework={hw}
              isCompleted={isCompleted(hw.id)}
              isOverdue={isOverdue(hw)}
              onComplete={() => setSelectedHomework(hw)}
            />
          ))
        )}
      </div>

      {/* Check-in modal */}
      {selectedHomework && (
        <CheckInModal
          homework={selectedHomework}
          isOpen={!!selectedHomework}
          onClose={() => setSelectedHomework(null)}
          onSuccess={fetchData}
        />
      )}
    </main>
  );
}
