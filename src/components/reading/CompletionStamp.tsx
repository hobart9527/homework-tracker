"use client";

import { useEffect, useState } from "react";

interface CompletionStampProps {
  show: boolean;
  message?: string;
  onDismiss?: () => void;
  autoDismissMs?: number;
}

export function CompletionStamp({
  show,
  message = "太棒了!",
  onDismiss,
  autoDismissMs = 3000,
}: CompletionStampProps) {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (show) {
      setDismissed(false);
      setVisible(true);

      const timer = setTimeout(() => {
        setVisible(false);
        setDismissed(true);
        onDismiss?.();
      }, autoDismissMs);

      return () => clearTimeout(timer);
    }
  }, [show, autoDismissMs, onDismiss]);

  if (!show || dismissed) return null;

  // Star burst particles
  const stars = Array.from({ length: 10 }, (_, i) => ({
    id: i,
    angle: (i / 10) * 360,
    distance: 80 + Math.random() * 40,
    delay: 0.2 + i * 0.05,
    size: 10 + Math.random() * 8,
  }));

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
      {/* Star burst particles */}
      {stars.map((star) => {
        const sx = Math.cos((star.angle * Math.PI) / 180) * star.distance;
        const sy = Math.sin((star.angle * Math.PI) / 180) * star.distance;
        return (
          <svg
            key={star.id}
            viewBox="0 0 24 24"
            fill="currentColor"
            className="absolute text-honey-400 animate-star-burst"
            style={{
              animationDelay: `${star.delay}s`,
              width: star.size,
              height: star.size,
              left: `calc(50% + ${sx}px)`,
              top: `calc(50% + ${sy}px)`,
            }}
          >
            <path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5z" />
          </svg>
        );
      })}

      {/* Stamp */}
      <div
        className={`relative flex h-36 w-36 flex-col items-center justify-center rounded-full border-4 border-forest-600 bg-forest-50 shadow-elevation-floating animate-stamp-reveal ${
          visible ? "" : "opacity-0 transition-opacity duration-500"
        }`}
      >
        {/* Inner ring */}
        <div className="absolute inset-2 rounded-full border-2 border-dashed border-forest-400" />

        {/* Star icon */}
        <div className="mb-1 text-2xl text-honey-400">
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
            <path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5z" />
          </svg>
        </div>

        {/* Message */}
        <div className="text-center">
          <span className="block text-lg font-bold text-forest-800">
            {message}
          </span>
          <span className="mt-0.5 block text-xs font-medium text-forest-600">
            已完成!
          </span>
        </div>
      </div>
    </div>
  );
}
