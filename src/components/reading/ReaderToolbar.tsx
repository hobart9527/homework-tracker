"use client";

import { useState } from "react";

interface ReaderToolbarProps {
  onTTSToggle?: () => void;
  ttsPlaying?: boolean;
  ttsPaused?: boolean;
  onTTSStop?: () => void;
  initialBookmarked?: boolean;
}

export function ReaderToolbar({
  onTTSToggle,
  ttsPlaying = false,
  ttsPaused = false,
  onTTSStop,
  initialBookmarked = false,
}: ReaderToolbarProps) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked);

  return (
    <div className="hidden lg:flex flex-col items-center gap-3">
      {/* TTS Button */}
      <button
        type="button"
        onClick={onTTSToggle}
        className="flex items-center justify-center rounded-xl transition-colors duration-fast min-h-[44px] min-w-[44px] w-11 h-11"
        style={{
          color: ttsPlaying ? "var(--reader-accent)" : "var(--reader-text)",
          backgroundColor: "var(--reader-surface)",
          border: "1px solid var(--reader-border)",
        }}
        aria-label={ttsPlaying && !ttsPaused ? "暂停朗读" : ttsPaused ? "继续朗读" : "朗读"}
        title={ttsPlaying && !ttsPaused ? "暂停朗读" : ttsPaused ? "继续朗读" : "朗读"}
      >
        <span className="text-lg" aria-hidden="true">
          {ttsPlaying && !ttsPaused ? "⏸️" : ttsPaused ? "▶️" : "🔊"}
        </span>
      </button>

      {ttsPlaying && onTTSStop && (
        <button
          type="button"
          onClick={onTTSStop}
          className="flex items-center justify-center rounded-xl transition-colors duration-fast min-h-[44px] min-w-[44px] w-11 h-11"
          style={{
            color: "var(--reader-text)",
            backgroundColor: "var(--reader-surface)",
            border: "1px solid var(--reader-border)",
          }}
          aria-label="停止朗读"
          title="停止朗读"
        >
          <span className="text-lg" aria-hidden="true">⏹️</span>
        </button>
      )}

      {/* Bookmark Button */}
      <button
        type="button"
        onClick={() => setBookmarked((prev) => !prev)}
        className="flex items-center justify-center rounded-xl transition-colors duration-fast min-h-[44px] min-w-[44px] w-11 h-11"
        style={{
          color: bookmarked ? "var(--reader-accent)" : "var(--reader-text)",
          backgroundColor: "var(--reader-surface)",
          border: "1px solid var(--reader-border)",
        }}
        aria-label={bookmarked ? "取消书签" : "添加书签"}
        title={bookmarked ? "取消书签" : "添加书签"}
        aria-pressed={bookmarked}
      >
        <span className="text-lg" aria-hidden="true">
          {bookmarked ? "🔖" : "🔖"}
        </span>
      </button>
    </div>
  );
}
