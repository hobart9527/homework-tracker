export default function ChildLoading() {
  return (
    <main className="min-h-screen bg-cream-50 p-4 lg:p-6">
      <div className="mx-auto grid max-w-[1480px] gap-4 lg:grid-cols-[minmax(360px,22rem)_1fr] xl:grid-cols-[420px_1fr] lg:gap-6">
        {/* Left aside skeletons */}
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          {/* WeekSummaryCard skeleton */}
          <div className="animate-pulse rounded-radius-xl bg-white/80 p-5 shadow-elevation-floating ring-1 ring-cream-200">
            <div className="h-5 w-24 rounded-full bg-ink-100" />
            <div className="mt-3 flex gap-4">
              <div className="flex-1 space-y-2">
                <div className="h-8 w-16 rounded-lg bg-ink-100" />
                <div className="h-3 w-20 rounded bg-ink-100" />
              </div>
              <div className="flex-1 space-y-2">
                <div className="h-8 w-16 rounded-lg bg-ink-100" />
                <div className="h-3 w-20 rounded bg-ink-100" />
              </div>
              <div className="flex-1 space-y-2">
                <div className="h-8 w-16 rounded-lg bg-ink-100" />
                <div className="h-3 w-20 rounded bg-ink-100" />
              </div>
            </div>
          </div>
          {/* WeekCalendar skeleton — 7-col grid */}
          <div className="animate-pulse rounded-radius-xl bg-white/80 p-4 shadow-elevation-floating ring-1 ring-cream-200">
            <div className="mb-3 h-4 w-20 rounded bg-ink-100" />
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="space-y-1 text-center">
                  <div className="mx-auto h-3 w-8 rounded bg-ink-100" />
                  <div className="mx-auto h-8 w-8 rounded-full bg-ink-100" />
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Right section skeletons */}
        <section className="animate-pulse space-y-4 rounded-radius-2xl bg-white/85 p-4 shadow-elevation-modal ring-1 ring-cream-200 backdrop-blur lg:p-6">
          {/* PriorityHomeworkCard skeleton */}
          <div className="rounded-radius-xl border border-cream-200 bg-cream-50/50 p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-ink-100" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-32 rounded bg-ink-100" />
                <div className="h-3 w-48 rounded bg-ink-100" />
              </div>
              <div className="h-8 w-20 rounded-full bg-ink-100" />
            </div>
          </div>
          {/* Task card skeletons */}
          <div className="space-y-3 pt-2">
            <div className="mb-2 flex items-center justify-between">
              <div className="h-6 w-20 rounded bg-ink-100" />
              <div className="h-4 w-12 rounded bg-ink-100" />
            </div>
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-xl border border-cream-200 bg-white p-3"
              >
                <div className="h-8 w-8 rounded-lg bg-ink-100" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 w-40 rounded bg-ink-100" />
                  <div className="h-3 w-24 rounded bg-ink-100" />
                </div>
                <div className="h-8 w-8 rounded-full bg-ink-100" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
