"use client";

import { useEffect, useState } from "react";

interface LevelUpModalProps {
  isOpen: boolean;
  newLevel: string;
  previousLevel: string;
  onClose: () => void;
  onContinue: () => void;
}

const LEVEL_COLORS: Record<string, { bg: string; text: string; border: string; glow: string }> = {
  L1: { bg: "bg-success", text: "text-success", border: "border-success/20", glow: "bg-success/10" },
  L2: { bg: "bg-success", text: "text-success", border: "border-success/20", glow: "bg-success/10" },
  L3: { bg: "bg-success", text: "text-success", border: "border-success/20", glow: "bg-success/10" },
  L4: { bg: "bg-info", text: "text-info", border: "border-info/20", glow: "bg-info/10" },
  L5: { bg: "bg-info", text: "text-info", border: "border-info/20", glow: "bg-info/10" },
  L6: { bg: "bg-info", text: "text-info", border: "border-info/20", glow: "bg-info/10" },
  L7: { bg: "bg-purple-500", text: "text-purple-700", border: "border-purple-200", glow: "bg-purple-100" },
  L8: { bg: "bg-purple-500", text: "text-purple-700", border: "border-purple-200", glow: "bg-purple-100" },
  L9: { bg: "bg-purple-500", text: "text-purple-700", border: "border-purple-200", glow: "bg-purple-100" },
  L10: { bg: "bg-purple-500", text: "text-purple-700", border: "border-purple-200", glow: "bg-purple-100" },
  L11: { bg: "bg-purple-500", text: "text-purple-700", border: "border-purple-200", glow: "bg-purple-100" },
  L12: { bg: "bg-purple-500", text: "text-purple-700", border: "border-purple-200", glow: "bg-purple-100" },
};

export function LevelUpModal({ isOpen, newLevel, previousLevel, onClose, onContinue }: LevelUpModalProps) {
  const [show, setShow] = useState(false);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShow(true);
      setAnimating(true);
      // Trigger animations after mount
      setTimeout(() => setAnimating(false), 1500);
    } else {
      setShow(false);
    }
  }, [isOpen]);

  if (!show) return null;

  const colors = LEVEL_COLORS[newLevel] || { bg: "bg-primary", text: "text-primary-700", border: "border-primary-200", glow: "bg-primary-100" };

  // Generate stars for animation
  const stars = Array.from({ length: 12 }, (_, i) => ({
    id: i,
    angle: (i / 12) * 360,
    distance: 120 + Math.random() * 60,
    delay: i * 0.08,
    size: 16 + Math.random() * 12,
  }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className={`relative z-10 w-full max-w-sm rounded-2xl ${colors.glow} border-2 ${colors.border} p-8 text-center shadow-elevation-modal transition-all duration-500 ${
          animating ? "scale-95 opacity-0" : "scale-100 opacity-100"
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="level-up-title"
      >
        {/* Animated stars */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <style>{`
            @keyframes star-burst {
              0% {
                transform: translate(0, 0) scale(0) rotate(0deg);
                opacity: 1;
              }
              50% {
                opacity: 1;
              }
              100% {
                transform: translate(var(--sx), var(--sy)) scale(1) rotate(180deg);
                opacity: 0;
              }
            }
            @keyframes level-pulse {
              0% { transform: scale(1); }
              50% { transform: scale(1.15); }
              100% { transform: scale(1.05); }
            }
            @keyframes float {
              0%, 100% { transform: translateY(0); }
              50% { transform: translateY(-8px); }
            }
          `}</style>

          {/* Star burst */}
          {stars.map((star) => {
            const sx = Math.cos((star.angle * Math.PI) / 180) * star.distance;
            const sy = Math.sin((star.angle * Math.PI) / 180) * star.distance;
            return (
              <svg
                key={star.id}
                viewBox="0 0 24 24"
                fill="currentColor"
                className="absolute left-1/2 top-1/2 text-honey-400"
                style={{
                  "--sx": `${sx}px`,
                  "--sy": `${sy}px`,
                  animation: `star-burst 1s ${star.delay}s ease-out forwards`,
                  width: star.size,
                  height: star.size,
                } as React.CSSProperties}
              >
                <path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5z" />
              </svg>
            );
          })}
        </div>

        {/* Content */}
        <div className="relative">
          {/* Celebration text */}
          <p className="mb-4 text-lg font-semibold text-ink-600 animate-[float_2s_ease-in-out_infinite]">
            恭喜升级！
          </p>

          {/* Level badge */}
          <div className={`relative mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full ${colors.bg} shadow-elevation-floating animate-[level-pulse_0.8s_ease-out]`}>
            <span className="text-3xl font-bold text-white">{newLevel}</span>
            {/* Glow effect */}
            <div className={`absolute inset-0 rounded-full ${colors.glow} animate-pulse -z-10 blur-xl opacity-60`} />
          </div>

          {/* Level transition */}
          <div className="mb-6 flex items-center justify-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-200 text-sm font-bold text-ink-500 line-through">
              {previousLevel}
            </div>
            <div className="text-2xl text-ink-400">→</div>
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${colors.bg} text-sm font-bold text-white`}>
              {newLevel}
            </div>
          </div>

          {/* Title */}
          <h2 id="level-up-title" className={`mb-2 text-xl font-bold ${colors.text}`}>
            你已升级到 {newLevel}！
          </h2>

          {/* Subtitle */}
          <p className="mb-8 text-sm text-ink-500">
            继续努力，阅读越来越厉害
          </p>

          {/* Action buttons */}
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={onContinue}
              className={`min-h-[48px] rounded-xl ${colors.bg} px-6 py-3 text-base font-semibold text-white shadow-elevation-floating transition hover:opacity-90 active:scale-[0.98]`}
            >
              继续阅读
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] rounded-xl bg-ink-100 px-6 py-2.5 text-sm font-medium text-ink-600 transition hover:bg-ink-200 active:scale-[0.98]"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
