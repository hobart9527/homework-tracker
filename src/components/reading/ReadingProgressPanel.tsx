"use client";

import { useEffect, useState } from "react";

interface ReadingProgressData {
  totalRead: number;
  avgScore: number;
  totalPoints: number;
  recent: {
    title: string;
    category: string;
    gradeLevel: number;
    score: number;
    total: number;
    date: string;
  }[];
}

interface ReadingProgressPanelProps {
  childId: string;
}

function getCurrentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
}

export function ReadingProgressPanel({ childId }: ReadingProgressPanelProps) {
  const [data, setData] = useState<ReadingProgressData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchProgress = async () => {
      setLoading(true);
      try {
        const month = getCurrentMonth();
        const res = await fetch(
          `/api/reading/progress?childId=${encodeURIComponent(childId)}&month=${month}`
        );
        if (!res.ok) {
          if (!cancelled) setData(null);
          return;
        }
        const json: ReadingProgressData = await res.json();
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchProgress();

    return () => {
      cancelled = true;
    };
  }, [childId]);

  if (loading) {
    return (
      <section className="rounded-2xl border border-cream-200/40 bg-white/90 p-5 shadow-elevation-raised">
        <div className="mb-4 h-5 w-24 animate-pulse rounded bg-ink-100" />
        <div className="mb-4 grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl bg-cream-50/70 p-3">
              <div className="mx-auto mb-1 h-6 w-6 rounded bg-ink-100" />
              <div className="mx-auto mb-1 h-7 w-10 rounded bg-ink-100" />
              <div className="mx-auto h-3 w-12 rounded bg-ink-100" />
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse flex items-center justify-between rounded-xl bg-cream-50/50 px-3 py-2">
              <div className="flex-1 space-y-1">
                <div className="h-4 w-32 rounded bg-ink-100" />
                <div className="h-3 w-16 rounded bg-ink-100" />
              </div>
              <div className="ml-2 h-5 w-10 rounded-full bg-ink-100" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (!data) {
    return null;
  }

  if (data.totalRead === 0) {
    return (
      <section className="rounded-2xl border border-cream-200/40 bg-white/90 p-5 shadow-elevation-raised">
        <h2 className="mb-4 text-xl font-bold text-forest-800">阅读情况</h2>
        <div className="rounded-xl border border-dashed border-cream-300 bg-cream-50 py-10 text-center text-ink-400">
          本月暂无阅读记录
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-cream-200/40 bg-white/90 p-5 shadow-elevation-raised">
      <h2 className="mb-4 text-xl font-bold text-forest-800">阅读情况</h2>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-cream-50/70 p-3 text-center">
          <div className="text-2xl">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7 mx-auto">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </div>
          <div className="text-2xl font-bold text-forest-700">{data.totalRead}</div>
          <div className="text-xs text-ink-500">本月阅读</div>
        </div>
        <div className="rounded-xl bg-cream-50/70 p-3 text-center">
          <div className="text-2xl">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7 mx-auto text-emerald-600">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div className="text-2xl font-bold text-forest-700">{data.avgScore}%</div>
          <div className="text-xs text-ink-500">平均正确率</div>
        </div>
        <div className="rounded-xl bg-cream-50/70 p-3 text-center">
          <div className="text-2xl">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 mx-auto text-honey-400">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </div>
          <div className="text-2xl font-bold text-forest-700">{data.totalPoints}</div>
          <div className="text-xs text-ink-500">阅读积分</div>
        </div>
      </div>

      {data.recent.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-forest-700">最近阅读</h4>
          <div className="space-y-2">
            {data.recent.slice(0, 5).map((item, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-xl bg-cream-50/50 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-forest-700">
                    {item.title}
                  </p>
                  <span className="text-xs text-ink-400">{item.category}</span>
                </div>
                <span className="ml-2 shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                  {item.score}/{item.total}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
