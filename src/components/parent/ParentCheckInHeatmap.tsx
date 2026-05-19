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
    return "bg-ink-100 text-ink-400";
  }

  if (intensity < 0.34) {
    return "bg-success-200 text-success-900";
  }

  if (intensity < 0.67) {
    return "bg-success-400 text-white";
  }

  return "bg-success-600 text-white";
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
          <h3 className="text-ui-lg font-ui-display font-semibold text-forest-800">{title}</h3>
          <p className="text-sm text-ink-500">{description}</p>
        </div>
        {peakBucket && peakBucket.count > 0 ? (
          <span className="rounded-full bg-ink-50 px-space-3 py-space-1 text-ui-xs font-medium text-ink-600">
            峰值 {peakBucket.hour.toString().padStart(2, "0")}:00
          </span>
        ) : null}
      </div>

      {populatedBuckets.length === 0 ? (
        <div className="rounded-radius-xl border border-dashed border-ink-300 bg-ink-50 px-space-4 py-space-5 text-center text-ui-sm text-ink-400">
          本月还没有打卡记录，热力图会在第一次完成作业后出现
        </div>
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto -mx-1 px-1">
            <div className="grid grid-cols-6 gap-2 sm:grid-cols-8 min-w-[320px]">
              {buckets.map((bucket) => {
                const intensity = peak === 0 ? 0 : bucket.count / peak;
                return (
                  <div key={bucket.hour} className="space-y-1 text-center">
                    <div
                      className={`mx-auto aspect-square w-full min-w-[36px] max-w-[52px] rounded-radius-xl shadow-elevation-raised ${getBucketClasses(intensity)}`}
                      aria-label={`${formatHour(bucket.hour)} ${bucket.count} 次`}
                      title={`${formatHour(bucket.hour)} · ${bucket.count} 次`}
                    />
                    <p className="text-ui-xs font-medium leading-4 text-ink-500">
                      {formatHour(bucket.hour)}
                    </p>
                    <p className="text-ui-xs text-ink-400">{bucket.count} 次</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-ui-xs text-ink-500">
            <span className="rounded-full bg-ink-100 px-2.5 py-1 text-ink-500">
              较少
            </span>
            <span className="rounded-full bg-success-200 px-2.5 py-1 text-success-900">
              一般
            </span>
            <span className="rounded-full bg-success-400 px-2.5 py-1 text-white">
              较多
            </span>
            <span className="rounded-full bg-success-600 px-2.5 py-1 text-white">
              高峰
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
