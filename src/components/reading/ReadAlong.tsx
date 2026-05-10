"use client";

import type { JSX } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// ReadAlong — Chinese audio read-along component (W0b)
//
// Frozen contract for downstream W0b consumers; do not break props shape.
// Forward-compatibility note (W2/W3): when `alignment` is provided, this
// component will eventually highlight characters in sync with playback.
// For now we only store it in state. TODO(W2): render character highlight.
// ─────────────────────────────────────────────────────────────────────────────

export interface ReadAlongAlignment {
  chars: { c: string; t0: number; t1: number }[]; // future use (W2/W3)
  duration: number;
}

export interface ReadAlongProps {
  audioUrl: string;
  voice?: string;
  alignment?: ReadAlongAlignment | null;
  className?: string;
}

const SPEED_OPTIONS = [0.75, 1, 1.25] as const;
type SpeedOption = (typeof SPEED_OPTIONS)[number];

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ReadAlong({
  audioUrl,
  voice,
  alignment,
  className,
}: ReadAlongProps): JSX.Element {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState<SpeedOption>(1);

  // Forward-compat: store alignment for future character-level highlighting.
  // TODO(W2/W3): drive a highlighted char index from currentTime + alignment.chars.
  const [, setStoredAlignment] = useState<ReadAlongAlignment | null>(
    alignment ?? null,
  );
  useEffect(() => {
    setStoredAlignment(alignment ?? null);
  }, [alignment]);

  // Wire up native <audio> events. Keep handlers minimal to avoid re-renders.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoadedMetadata = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    };
    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(audio.duration || 0);
    };

    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.pause();
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  }, [audioUrl]);

  // Apply playbackRate whenever speed changes.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = speed;
  }, [speed]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  }, []);

  const handleScrub = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const audio = audioRef.current;
      if (!audio) return;
      const next = Number(event.target.value);
      if (Number.isFinite(next)) {
        audio.currentTime = next;
        setCurrentTime(next);
      }
    },
    [],
  );

  const handleSpeed = useCallback((next: SpeedOption) => {
    setSpeed(next);
  }, []);

  const containerClass = [
    "rounded-radius-lg bg-cream-50 p-4 shadow-elevation-raised ring-1 ring-forest-100",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const playLabel = isPlaying ? "暂停朗读" : "播放朗读";

  return (
    <section
      role="region"
      aria-label="中文朗读播放器"
      className={containerClass}
    >
      {/* Hidden native audio element; we drive UI from it. */}
      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playLabel}
          aria-pressed={isPlaying}
          className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-forest-500 text-white shadow-elevation-raised transition hover:bg-forest-600 active:scale-95"
        >
          {isPlaying ? (
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-6 w-6"
              fill="currentColor"
            >
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-6 w-6"
              fill="currentColor"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <div className="flex flex-1 flex-col gap-1">
          <input
            type="range"
            min={0}
            max={duration > 0 ? duration : 0}
            step={0.1}
            value={currentTime}
            onChange={handleScrub}
            aria-label="音频进度"
            className="w-full accent-forest-500"
          />
          <div
            className="flex items-center justify-between text-ui-xs text-ink-500"
            aria-live="polite"
          >
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div
          className="flex items-center gap-1 rounded-full bg-forest-50 p-1"
          role="group"
          aria-label="播放速度"
        >
          {SPEED_OPTIONS.map((opt) => {
            const active = opt === speed;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => handleSpeed(opt)}
                aria-pressed={active}
                aria-label={`速度 ${opt} 倍`}
                className={[
                  "rounded-full px-3 py-1 text-ui-xs font-medium transition",
                  active
                    ? "bg-forest-500 text-white shadow-elevation-raised"
                    : "text-forest-700 hover:bg-forest-100",
                ].join(" ")}
              >
                {opt}x
              </button>
            );
          })}
        </div>

        {voice ? (
          <span className="text-ui-xs text-ink-500">{`朗读: ${voice}`}</span>
        ) : null}
      </div>
    </section>
  );
}

export default ReadAlong;
