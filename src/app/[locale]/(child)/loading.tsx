export default function ChildLoading() {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-8 space-y-6 animate-pulse">
      {/* Title skeleton */}
      <div className="w-full max-w-md space-y-3">
        <div className="h-6 w-32 bg-ink-200 rounded-md" />
        <div className="h-4 w-48 bg-ink-200 rounded-md" />
      </div>

      {/* Card skeletons */}
      <div className="w-full max-w-md space-y-3">
        <div className="h-20 w-full bg-white rounded-xl" />
        <div className="h-20 w-full bg-white rounded-xl" />
        <div className="h-20 w-full bg-white rounded-xl" />
      </div>
    </div>
  );
}
