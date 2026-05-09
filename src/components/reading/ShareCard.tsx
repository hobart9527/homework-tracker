"use client";

interface ShareCardProps {
  title: string;
  score: number;
  total: number;
  readingTime: number; // minutes
  summary?: string;
  onShare?: () => void;
}

export function ShareCard({ title, score, total, readingTime, summary, onShare }: ShareCardProps) {
  const percentage = Math.round((score / total) * 100);

  return (
    <div className="w-full max-w-sm mx-auto bg-gradient-to-br from-forest-50 to-cream-50 rounded-2xl p-6 shadow-lg border border-forest-100">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-full bg-forest-600 flex items-center justify-center">
          <span className="text-white text-sm font-bold">R</span>
        </div>
        <span className="text-sm font-medium text-forest-700">Reading Tracker</span>
      </div>

      {/* Title */}
      <h3 className="text-lg font-bold text-forest-800 mb-3 line-clamp-2">
        {title}
      </h3>

      {/* Score */}
      <div className="flex items-center justify-center mb-4">
        <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center border-4 border-primary/20">
          <div className="text-center">
            <div className="text-3xl font-bold text-primary">{percentage}%</div>
            <div className="text-xs text-primary/70">{score}/{total}</div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="flex justify-center gap-6 mb-4 text-sm text-ink-600">
        <div className="text-center">
          <div className="font-bold text-forest-700">{readingTime}</div>
          <div className="text-xs">分钟</div>
        </div>
      </div>

      {/* Summary */}
      {summary && (
        <p className="text-sm text-ink-500 text-center mb-4 italic">
          &ldquo;{summary}&rdquo;
        </p>
      )}

      {/* Share button */}
      {onShare && (
        <button
          onClick={onShare}
          className="w-full py-3 rounded-xl bg-forest-600 text-white font-medium hover:bg-forest-700 transition-colors"
        >
          分享成果
        </button>
      )}
    </div>
  );
}
