"use client";

import { useEffect, useState, useMemo } from "react";
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

  // --- Visual enhancement derived state ---

  function getLocalDateStr(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  const MILESTONES = [50, 100, 200, 500];

  const todayStr = useMemo(() => getLocalDateStr(new Date()), []);

  const todayPoints = useMemo(
    () =>
      checkIns
        .filter((ci) => ci.completed_at && getLocalDateStr(new Date(ci.completed_at)) === todayStr)
        .reduce((s, ci) => s + ci.points_earned, 0),
    [checkIns, todayStr]
  );

  const weeklyCheckIns = useMemo(() => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    return checkIns.filter((ci) => {
      const d = ci.completed_at ? new Date(ci.completed_at) : null;
      return d && d >= monday;
    });
  }, [checkIns]);

  const weeklyPoints = useMemo(() => weeklyCheckIns.reduce((s, ci) => s + ci.points_earned, 0), [weeklyCheckIns]);

  const nextMilestone = useMemo(() => MILESTONES.find((m) => m > totalPoints) ?? null, [totalPoints]);

  const milestoneProgress = useMemo(() => {
    if (!nextMilestone) return 100;
    const prev = [...MILESTONES].reverse().find((m) => m <= totalPoints) ?? 0;
    return ((totalPoints - prev) / (nextMilestone - prev)) * 100;
  }, [totalPoints, nextMilestone]);

  const sparkles = useMemo(() => {
    if (totalPoints <= 0) return [];
    return Array.from({ length: 8 }, (_, i) => ({
      id: i,
      left: 10 + Math.random() * 80,
      delay: Math.random() * 0.8,
      duration: 0.8 + Math.random() * 0.7,
    }));
  }, [totalPoints]);

  if (loading)
    return <div className="min-h-screen flex items-center justify-center">{t('common.loading')}</div>;

  return (
    <main className="max-w-5xl mx-auto p-4 pb-24">
      {/* Big points display */}
      <div className="bg-primary text-white rounded-2xl shadow-lg p-8 text-center mb-6 relative overflow-hidden">
        {sparkles.map((s) => (
          <svg
            key={s.id}
            viewBox="0 0 24 24"
            fill="currentColor"
            className="absolute animate-float-up pointer-events-none text-honey-400"
            style={{
              left: `${s.left}%`,
              top: "35%",
              width: 18 + (s.id % 3) * 4,
              height: 18 + (s.id % 3) * 4,
              animationDelay: `${s.delay}s`,
              animationDuration: `${s.duration}s`,
            }}
          >
            <path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5z" />
          </svg>
        ))}
        <div className="text-3xl mb-2">
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10 mx-auto text-honey-400">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </div>
        <div className="text-6xl font-bold">{totalPoints}</div>
        <div className="text-lg opacity-80 mt-2">{t('child.rewards.title')}</div>
        {todayPoints > 0 && (
          <div className="mt-3 inline-flex items-center gap-1.5 bg-cream-50/20 rounded-full px-4 py-1 text-sm backdrop-blur-sm">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="6" />
              <circle cx="12" cy="12" r="2" />
            </svg>
            今日已获得 +{todayPoints} 积分
          </div>
        )}
      </div>

      {/* Milestone progress */}
      {nextMilestone ? (
        <div className="bg-cream-50 rounded-2xl shadow-elevation-raised p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-forest-700">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 inline-block mr-1.5">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                <line x1="4" y1="22" x2="4" y2="15" />
              </svg>
              下一个目标: {nextMilestone} 积分
            </span>
            <span className="text-xs text-forest-400">
              {totalPoints} / {nextMilestone}
            </span>
          </div>
          <div className="w-full bg-forest-100 rounded-full h-3 overflow-hidden">
            <div
              className="bg-primary h-full rounded-full transition-all duration-700 ease-out"
              style={{ width: `${milestoneProgress}%` }}
            />
          </div>
        </div>
      ) : totalPoints > 0 ? (
        <div className="bg-cream-50 rounded-2xl shadow-elevation-raised p-4 mb-4 text-center">
          <p className="text-forest-700 font-medium">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 inline-block mr-1.5">
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C6 4 8 6 8 9z" />
              <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C18 4 16 6 16 9z" />
              <path d="M4 22h16" />
              <path d="M10 22V12a2 2 0 0 1 2-2 2 2 0 0 1 2 2v10" />
              <path d="M8 9h8v2a4 4 0 0 1-8 0V9z" />
            </svg>
            你已经达成所有里程碑！
          </p>
        </div>
      ) : null}

      {/* Weekly star */}
      <div className="bg-cream-50 rounded-2xl shadow-elevation-raised p-4 mb-4">
        <h3 className="font-medium text-forest-700 mb-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 inline-block mr-1.5">
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C6 4 8 6 8 9z" />
            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C18 4 16 6 16 9z" />
            <path d="M4 22h16" />
            <path d="M10 22V12a2 2 0 0 1 2-2 2 2 0 0 1 2 2v10" />
            <path d="M8 9h8v2a4 4 0 0 1-8 0V9z" />
          </svg>
          每周之星
        </h3>
        {weeklyCheckIns.length > 0 ? (
          <div className="flex items-center gap-3">
            <span className="text-3xl">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-honey-400">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </span>
            <div>
              <p className="text-sm text-forest-700 font-medium">
                本周已完成 {weeklyCheckIns.length} 次打卡
              </p>
              <p className="text-xs text-forest-400">
                共获得 +{weeklyPoints} 积分
              </p>
            </div>
          </div>
        ) : (
          <p className="text-forest-400 text-sm">本周还没打卡呢，加油哦</p>
        )}
      </div>

      {/* History */}
      <div className="bg-cream-50 rounded-2xl shadow-elevation-raised p-4">
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
                    <span className="text-2xl">{hw?.type_icon || (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    )}</span>
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
