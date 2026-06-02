"use client";

export default function ChildError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
      <div className="max-w-sm space-y-4">
        {/* Error icon */}
        <div className="mx-auto w-16 h-16 rounded-full bg-coral-100 flex items-center justify-center">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="w-8 h-8 text-coral-500"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="13" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>

        {/* Message */}
        <h2 className="text-lg font-semibold text-ink-800">
          出了点小问题
        </h2>
        <p className="text-sm text-ink-500">
          {error.message || "页面加载失败，请稍后重试。"}
        </p>

        {/* Digest */}
        {error.digest && (
          <p className="text-xs text-ink-400 font-mono select-all">
            错误码: {error.digest}
          </p>
        )}

        {/* Retry button */}
        <button
          onClick={reset}
          className="bg-forest-500 text-white px-4 py-2 rounded-lg hover:bg-forest-600 transition-colors"
        >
          重试
        </button>
      </div>
    </div>
  );
}
