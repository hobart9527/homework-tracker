export default function ParentLoading() {
  return (
    <div className="max-w-7xl mx-auto space-y-space-8">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="animate-pulse h-8 w-40 rounded bg-ink-100" />
        <div className="animate-pulse h-8 w-16 rounded bg-ink-100" />
      </div>

      {/* Two-column skeleton */}
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Left column: task list + heatmap */}
        <div className="space-y-space-6">
          <div className="animate-pulse rounded-radius-xl border border-ink-300 bg-white p-space-5 shadow-elevation-raised">
            <div className="mb-3 h-5 w-32 rounded bg-ink-100" />
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-6 w-6 rounded bg-ink-100" />
                  <div className="h-12 flex-1 rounded bg-ink-100" />
                </div>
              ))}
            </div>
          </div>
          <div className="animate-pulse h-24 rounded-radius-xl border border-ink-300 bg-white p-space-5 shadow-elevation-raised" />
        </div>
        {/* Right column: calendar + insights */}
        <div className="space-y-space-6">
          <div className="animate-pulse h-72 rounded-radius-xl border border-ink-300 bg-white p-space-5 shadow-elevation-raised">
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className="mx-auto h-8 w-8 rounded-full bg-ink-100" />
              ))}
            </div>
          </div>
          <div className="animate-pulse h-32 rounded-radius-xl border border-ink-300 bg-white p-space-5 shadow-elevation-raised" />
        </div>
      </div>
    </div>
  );
}
