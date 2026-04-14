"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import type { Database } from "@/lib/supabase/types";

type CheckIn = Database["public"]["Tables"]["check_ins"]["Row"];
type Homework = Database["public"]["Tables"]["homeworks"]["Row"];

export default function RewardsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const supabase = createClient();
  const [totalPoints, setTotalPoints] = useState(0);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [homeworks, setHomeworks] = useState<Homework[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push("/child-login");
        return;
      }

      const [hwRes, ciRes] = await Promise.all([
        supabase.from("homeworks").select("*").eq("child_id", session.user.id),
        supabase
          .from("check_ins")
          .select("*")
          .eq("child_id", session.user.id)
          .order("completed_at", { ascending: false }),
      ]);

      if (hwRes.data) setHomeworks(hwRes.data);
      if (ciRes.data) setCheckIns(ciRes.data);
      if (ciRes.data) {
        setTotalPoints(ciRes.data.reduce((s, ci) => s + ci.points_earned, 0));
      }
      setLoading(false);
    };
    fetchData();
  }, [supabase]);

  if (loading)
    return <div className="min-h-screen flex items-center justify-center">{t('common.loading')}</div>;

  return (
    <main className="max-w-5xl mx-auto p-4 pb-24">
      {/* Big points display */}
      <div className="bg-primary text-white rounded-2xl shadow-lg p-8 text-center mb-6">
        <div className="text-3xl mb-2">⭐</div>
        <div className="text-6xl font-bold">{totalPoints}</div>
        <div className="text-lg opacity-80 mt-2">{t('child.rewards.title')}</div>
      </div>

      {/* History */}
      <div className="bg-white rounded-2xl shadow-md p-4">
        <h3 className="font-medium text-forest-700 mb-3">{t('child.rewards.title')}</h3>
        {checkIns.length === 0 ? (
          <p className="text-forest-400 text-center py-8">{t('child.rewards.noRewards')}</p>
        ) : (
          <div className="space-y-2">
            {checkIns.slice(0, 50).map((ci) => {
              const hw = homeworks.find((h) => h.id === ci.homework_id);
              const displayTime = ci.created_at || ci.completed_at;
              return (
                <div
                  key={ci.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-forest-50"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{hw?.type_icon || "📝"}</span>
                    <div>
                      <div className="text-sm font-medium text-forest-700">
                        +{ci.points_earned} {hw?.title || "作业"}
                      </div>
                      <p className="text-xs text-forest-400 mt-1">
                        {ci.is_scored
                          ? ci.is_late
                            ? t('child.dayHomework.lateComplete')
                            : t('child.dayHomework.completed')
                          : t('child.dayHomework.noPointRepeat')}
                      </p>
                      {ci.note && (
                        <p className="text-xs text-forest-500">{ci.note}</p>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-forest-400 whitespace-nowrap">
                    {ci.completed_at
                      ? new Date(ci.completed_at).toLocaleDateString()
                      : "时间待定"}{" "}
                    {displayTime
                      ? new Date(displayTime).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : ""}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
