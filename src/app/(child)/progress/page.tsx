"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getWeekDays } from "@/lib/homework-utils";
import type { Database } from "@/lib/supabase/types";

type CheckIn = Database["public"]["Tables"]["check_ins"]["Row"];

export default function ProgressPage() {
  const supabase = createClient();
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [dailyCount, setDailyCount] = useState<Record<string, number>>({});

  useEffect(() => {
    const fetchData = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const today = new Date();
      const monday = new Date(today);
      const dayOfWeek = today.getDay();
      monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      monday.setHours(0, 0, 0, 0);

      const { data } = await supabase
        .from("check_ins")
        .select("*")
        .eq("child_id", session.user.id)
        .gte("completed_at", monday.toISOString())
        .order("completed_at", { ascending: true });

      if (data) {
        setCheckIns(data);
        // Group by date
        const counts: Record<string, number> = {};
        getWeekDays(today).forEach((d) => {
          const key = d.toISOString().split("T")[0];
          counts[key] = 0;
        });
        data.forEach((ci) => {
          const key = new Date(ci.completed_at).toISOString().split("T")[0];
          counts[key] = (counts[key] || 0) + 1;
        });
        setDailyCount(counts);
      }
      setLoading(false);
    };
    fetchData();
  }, [supabase]);

  if (loading) return <div className="min-h-screen flex items-center justify-center">📊 加载中...</div>;

  const maxCount = Math.max(...Object.values(dailyCount), 1);

  return (
    <main className="max-w-5xl mx-auto p-4 pb-24">
      <h1 className="text-2xl font-bold text-forest-700 mb-6">本周进度</h1>

      {/* Bar chart */}
      <div className="bg-white rounded-2xl shadow-md p-6 mb-6">
        <div className="flex items-end gap-4 h-48">
          {Object.entries(dailyCount).map(([date, count]) => {
            const height = (count / maxCount) * 100;
            const d = new Date(`${date}T00:00:00`);
            const dayLabels = ["日", "一", "二", "三", "四", "五", "六"];
            return (
              <div key={date} className="flex-1 flex flex-col items-center">
                <span className="text-sm text-forest-600 mb-1">{count}</span>
                <div
                  className="w-full rounded-t-xl transition-all duration-500"
                  style={{
                    height: `${height}%`,
                    minHeight: count > 0 ? "8px" : "2px",
                    backgroundColor:
                      count > 0 ? "var(--forest-500, #56AB91)" : "#E8FFF0",
                  }}
                />
                <span className="text-xs text-forest-400 mt-2">
                  {dayLabels[d.getDay()]}
                </span>
                <span className="text-xs text-forest-400">{d.getDate()}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-2xl shadow-md p-4 text-center">
          <div className="text-3xl font-bold text-forest-700">
            {checkIns.length}
          </div>
          <div className="text-sm text-forest-500">本周打卡次数</div>
        </div>
        <div className="bg-white rounded-2xl shadow-md p-4 text-center">
          <div className="text-3xl font-bold text-primary">
            {checkIns.reduce((s, ci) => s + ci.points_earned, 0)}
          </div>
          <div className="text-sm text-forest-500">本周积分</div>
        </div>
      </div>

      {/* History */}
      <div className="bg-white rounded-2xl shadow-md p-4">
        <h3 className="font-medium text-forest-700 mb-3">打卡记录</h3>
        {checkIns.length === 0 ? (
          <p className="text-forest-400 text-center py-8">本周还没有打卡</p>
        ) : (
          <div className="space-y-2">
            {checkIns.map((ci) => (
              <div
                key={ci.id}
                className="flex items-center justify-between p-3 rounded-xl bg-forest-50"
              >
                <div>
                  <span className="text-sm font-medium text-forest-700">
                    +{ci.points_earned} 积分
                  </span>
                  {ci.note && (
                    <p className="text-xs text-forest-500">{ci.note}</p>
                  )}
                </div>
                <span className="text-xs text-forest-400">
                  {new Date(ci.completed_at).toLocaleDateString()}{" "}
                  {new Date(ci.completed_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
