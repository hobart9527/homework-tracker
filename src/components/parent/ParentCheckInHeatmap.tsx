"use client";

import type { ParentCheckInHeatmapBucket } from "@/lib/parent-dashboard";

interface ParentCheckInHeatmapProps {
  buckets: ParentCheckInHeatmapBucket[];
  title?: string;
  description?: string;
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

export function ParentCheckInHeatmap({
  buckets,
  title = "本月时段热力图",
  description = "统计当月所有打卡记录，颜色越深说明这个小时越常完成作业",
}: ParentCheckInHeatmapProps) {
  const peak = Math.max(...buckets.map((bucket) => bucket.count), 0);
  const populatedBuckets = buckets.filter((bucket) => bucket.count > 0);
  const peakBucket = buckets.reduce<ParentCheckInHeatmapBucket | null>(
    (currentPeak, bucket) => {
      if (!currentPeak || bucket.count > currentPeak.count) {
        return bucket;
      }

      return currentPeak;
    },
    null
  );

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-forest-800">{title}</h3>
          <p className="text-sm text-forest-500">{description}</p>
        </div>
        {peakBucket && peakBucket.count > 0 ? (
          <span className="rounded-full bg-forest-100 px-3 py-1 text-xs font-medium text-forest-600">
            峰值 {peakBucket.hour.toString().padStart(2, "0")}:00
          </span>
        ) : null}
      </div>

      {populatedBuckets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-forest-200 bg-forest-50 px-4 py-5 text-center text-sm text-forest-400">
          本月还没有打卡记录，热力图会在第一次完成作业后出现
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 xl:grid-cols-8">
            {buckets.map((bucket) => {
              const intensity = peak === 0 ? 0 : bucket.count / peak;
              return (
                <div key={bucket.hour} className="space-y-1 text-center">
                  <div
                    className={`mx-auto aspect-square w-full max-w-[52px] rounded-2xl shadow-sm ${getBucketClasses(intensity)}`}
                    aria-label={`${formatHour(bucket.hour)} ${bucket.count} 次`}
                    title={`${formatHour(bucket.hour)} · ${bucket.count} 次`}
                  />
                  <p className="text-[11px] font-medium leading-4 text-forest-500">
                    {formatHour(bucket.hour)}
                  </p>
                  <p className="text-xs text-forest-400">{bucket.count} 次</p>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-forest-500">
            <span className="rounded-full bg-forest-100 px-2.5 py-1 text-forest-500">
              较少
            </span>
            <span className="rounded-full bg-emerald-200 px-2.5 py-1 text-emerald-900">
              一般
            </span>
            <span className="rounded-full bg-emerald-400 px-2.5 py-1 text-white">
              较多
            </span>
            <span className="rounded-full bg-emerald-600 px-2.5 py-1 text-white">
              高峰
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
