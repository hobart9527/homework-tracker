"use client";

import { useState } from "react";

interface ReaderToolbarProps {
  onTTSToggle?: () => void;
  ttsPlaying?: boolean;
  ttsPaused?: boolean;
  onTTSStop?: () => void;
  initialBookmarked?: boolean;
}

// ── SVG Icons ─────────────────────────────────────────────────────

function IconPause({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

function IconPlay({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M8 5.14v13.72a1 1 0 001.5.86l11-6.86a1 1 0 000-1.72l-11-6.86a1 1 0 00-1.5.86z" />
    </svg>
  );
}

function IconVolume({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 010 7.07" />
    </svg>
  );
}

function IconStop({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  );
}

function IconBookmark({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
    </svg>
  );
}

function IconBookmarkFilled({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────

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
        className="flex items-center justify-center rounded-xl transition-all duration-fast min-h-[48px] min-w-[48px] w-12 h-12 shadow-sm hover:shadow-md"
        style={{
          color: ttsPlaying ? "var(--reader-accent)" : "var(--reader-text)",
          backgroundColor: "var(--reader-surface)",
          border: "1px solid var(--reader-border)",
        }}
        aria-label={ttsPlaying && !ttsPaused ? "暂停朗读" : ttsPaused ? "继续朗读" : "朗读"}
        title={ttsPlaying && !ttsPaused ? "暂停朗读" : ttsPaused ? "继续朗读" : "朗读"}
      >
        {ttsPlaying && !ttsPaused ? (
          <IconPause className="w-5 h-5" />
        ) : ttsPaused ? (
          <IconPlay className="w-5 h-5" />
        ) : (
          <IconVolume className="w-5 h-5" />
        )}
      </button>

      {ttsPlaying && onTTSStop && (
        <button
          type="button"
          onClick={onTTSStop}
          className="flex items-center justify-center rounded-xl transition-all duration-fast min-h-[48px] min-w-[48px] w-12 h-12 shadow-sm hover:shadow-md"
          style={{
            color: "var(--reader-text)",
            backgroundColor: "var(--reader-surface)",
            border: "1px solid var(--reader-border)",
          }}
          aria-label="停止朗读"
          title="停止朗读"
        >
          <IconStop className="w-5 h-5" />
        </button>
      )}

      {/* Bookmark Button */}
      <button
        type="button"
        onClick={() => setBookmarked((prev) => !prev)}
        className="flex items-center justify-center rounded-xl transition-all duration-fast min-h-[48px] min-w-[48px] w-12 h-12 shadow-sm hover:shadow-md"
        style={{
          color: bookmarked ? "var(--reader-accent)" : "var(--reader-text)",
          backgroundColor: "var(--reader-surface)",
          border: "1px solid var(--reader-border)",
        }}
        aria-label={bookmarked ? "取消书签" : "添加书签"}
        title={bookmarked ? "取消书签" : "添加书签"}
        aria-pressed={bookmarked}
      >
        {bookmarked ? (
          <IconBookmarkFilled className="w-5 h-5" />
        ) : (
          <IconBookmark className="w-5 h-5" />
        )}
      </button>
    </div>
  );
}
