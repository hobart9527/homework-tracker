"use client";

import type { ParentMonthlyInsight } from "@/lib/parent-dashboard";

interface ParentMonthlyInsightsProps {
  weakestTypes: ParentMonthlyInsight[];
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function ParentMonthlyInsights({
  weakestTypes,
}: ParentMonthlyInsightsProps) {
  return (
    <section className="h-full rounded-3xl border border-forest-200 bg-white/90 p-5 shadow-sm">
      <div>
        <h2 className="text-xl font-bold text-forest-800">本月薄弱类型</h2>
        <p className="text-sm text-forest-500">
          按本月完成率从低到高排序，优先关注最需要跟进的作业类型
        </p>
      </div>

      {weakestTypes.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-forest-200 bg-forest-50 py-10 text-center text-forest-400">
          本月还没有作业类型数据
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {weakestTypes.map((item, index) => (
            <li
              key={item.typeName}
              className="flex items-center justify-between gap-4 rounded-2xl border border-forest-100 bg-forest-50/80 px-4 py-3"
            >
              <div>
                <p className="text-sm text-forest-400">#{index + 1} 重点关注</p>
                <p className="text-lg font-semibold text-forest-800">
                  {item.typeName}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-forest-800">
                  {formatPercent(item.completionRate)}
                </p>
                <p className="text-sm text-forest-500">
                  {item.completedCount}/{item.assignedCount} 完成
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
