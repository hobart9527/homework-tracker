import { StatCard } from "@/components/child/StatCard";
import { IconStar, IconDocument, IconCheck } from "@/components/ui/icons";

interface ChildWeekSummaryCardProps {
  weeklyPoints: number;
  weeklyCheckIns: number;
  completedDays: number;
}

export function ChildWeekSummaryCard({
  weeklyPoints,
  weeklyCheckIns,
  completedDays,
}: ChildWeekSummaryCardProps) {
  return (
    <div className="rounded-radius-xl bg-white p-5 shadow-elevation-floating ring-1 ring-cream-200">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-ink-500">本周总览</p>
          <h2 className="mt-1 text-xl font-bold text-forest-700">稳稳推进每一天</h2>
        </div>
        <span className="rounded-full bg-cream-100 px-3 py-1 text-xs font-medium text-forest-600">
          iPad 横屏
        </span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <StatCard icon={<IconStar className="w-6 h-6 text-honey-400" />} value={weeklyPoints} label="本周积分" />
        <StatCard icon={<IconDocument className="w-6 h-6 text-forest-500" />} value={weeklyCheckIns} label="本周打卡" />
        <StatCard icon={<IconCheck className="w-6 h-6 text-emerald-500" />} value={completedDays} label="完成天数" />
      </div>
    </div>
  );
}
