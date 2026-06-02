"use client";

export default function ReaderError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-center px-4">
        <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
          <span className="text-red-500 text-xl font-bold">!</span>
        </div>
        <h2 className="text-slate-800 text-lg font-semibold">Something went wrong</h2>
        <p className="text-slate-600 text-sm max-w-sm">
          An unexpected error occurred. Please try again.
        </p>
        <button
          onClick={reset}
          className="bg-forest-500 text-white px-4 py-2 rounded-lg hover:bg-forest-600 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
