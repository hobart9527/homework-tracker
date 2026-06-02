export default function ParentLoading() {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 space-y-6 animate-pulse">
      {/* Kicker + Title skeleton */}
      <div className="w-full max-w-4xl space-y-2">
        <div className="h-3 w-20 bg-ink-200 rounded-md" />
        <div className="h-7 w-40 bg-ink-200 rounded-lg" />
      </div>

      {/* Content card skeletons */}
      <div className="w-full max-w-4xl space-y-4">
        <div className="h-28 w-full bg-white rounded-xl" />
        <div className="h-28 w-full bg-white rounded-xl" />
        <div className="h-28 w-full bg-white rounded-xl" />
      </div>
    </div>
  );
}
