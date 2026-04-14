"use client";

import type { ParentMonthlyStats as ParentMonthlyStatsData } from "@/lib/parent-dashboard";

interface ParentMonthlyStatsProps {
  stats?: ParentMonthlyStatsData;
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function StatCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string | number;
  helper: string;
}) {
  return (
    <div className="rounded-2xl border border-forest-100 bg-white/80 p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-forest-400">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-forest-800">{value}</p>
      <p className="mt-1 text-sm text-forest-500">{helper}</p>
    </div>
  );
}

export function ParentMonthlyStats({ stats }: ParentMonthlyStatsProps) {
  const safeStats = stats ?? {
    completionRate: 0,
    onTimeRate: 0,
    totalPoints: 0,
    makeupDays: 0,
  };

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-lg font-semibold text-forest-800">本月关键指标</h3>
        <p className="text-sm text-forest-500">帮助你快速判断这个月的执行节奏和补做压力</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="完成率"
          value={formatPercent(safeStats.completionRate)}
          helper="按全月已布置任务计算"
        />
        <StatCard
          label="准时率"
          value={formatPercent(safeStats.onTimeRate)}
          helper="越高说明拖延越少"
        />
        <StatCard
          label="累计积分"
          value={safeStats.totalPoints}
          helper="本月已获得总积分"
        />
        <StatCard
          label="补做天数"
          value={safeStats.makeupDays}
          helper="出现逾期补做的日期数"
        />
      </div>
    </section>
  );
}
