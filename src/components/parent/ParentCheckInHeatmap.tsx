"use client";

import type { ParentCheckInHeatmapBucket } from "@/lib/parent-dashboard";

interface ParentCheckInHeatmapProps {
  buckets: ParentCheckInHeatmapBucket[];
}

function formatHour(hour: number) {
  return `${hour.toString().padStart(2, "0")}:00`;
}

function getBucketClasses(intensity: number) {
  if (intensity <= 0) {
    return "bg-forest-100 text-forest-400";
  }

  if (intensity < 0.34) {
    return "bg-emerald-200 text-emerald-900";
  }

  if (intensity < 0.67) {
    return "bg-emerald-400 text-white";
  }

  return "bg-emerald-600 text-white";
}

export function ParentCheckInHeatmap({ buckets }: ParentCheckInHeatmapProps) {
  const peak = Math.max(...buckets.map((bucket) => bucket.count), 0);
  const populatedBuckets = buckets.filter((bucket) => bucket.count > 0);

  return (
    <section className="rounded-3xl border border-forest-200 bg-white/90 p-5 shadow-sm">
      <div>
        <h2 className="text-xl font-bold text-forest-800">打卡高峰时段</h2>
        <p className="text-sm text-forest-500">看看孩子们更常在一天中的哪些时段完成作业</p>
      </div>

      {populatedBuckets.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-forest-200 bg-forest-50 py-10 text-center text-forest-400">
          本月还没有打卡记录，热力图会在第一次完成作业后出现
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-12">
          {buckets.map((bucket) => {
            const intensity = peak === 0 ? 0 : bucket.count / peak;
            return (
              <div
                key={bucket.hour}
                className={`rounded-2xl px-3 py-4 text-center shadow-sm ${getBucketClasses(
                  intensity
                )}`}
              >
                <p className="text-xs font-medium uppercase tracking-[0.16em] opacity-80">
                  {formatHour(bucket.hour)}
                </p>
                <p className="mt-2 text-2xl font-bold">{bucket.count}</p>
                <p className="mt-1 text-xs opacity-80">次打卡</p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
