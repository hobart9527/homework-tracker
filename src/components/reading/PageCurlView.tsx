"use client";

import { useRef, useState, useCallback, type ReactNode } from "react";

interface PageCurlViewProps {
  pages: ReactNode[];
  currentPage: number;
  onPageChange: (page: number) => void;
}

export function PageCurlView({ pages, currentPage, onPageChange }: PageCurlViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  const goToPage = useCallback((targetPage: number) => {
    if (isAnimating || targetPage === currentPage) return;
    if (targetPage < 0 || targetPage >= pages.length) return;

    setIsAnimating(true);
    onPageChange(targetPage);

    setTimeout(() => setIsAnimating(false), 600);
  }, [currentPage, pages.length, onPageChange, isAnimating]);

  // Touch handling
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const dx = touchStartRef.current.x - e.changedTouches[0].clientX;
    const dy = touchStartRef.current.y - e.changedTouches[0].clientY;

    // Only handle horizontal swipes
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      if (dx > 0) {
        goToPage(currentPage + 1);
      } else {
        goToPage(currentPage - 1);
      }
    }
    touchStartRef.current = null;
  };

  // Click zones
  const handleClick = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const width = rect.width;

    if (x < width * 0.2) {
      goToPage(currentPage - 1);
    } else if (x > width * 0.8) {
      goToPage(currentPage + 1);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[calc(100dvh-8rem)] overflow-hidden"
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="flex h-full"
        style={{
          transform: `translateX(calc(-${currentPage} * 100%))`,
          transition: isAnimating
            ? "transform 600ms cubic-bezier(.65, 0, .35, 1)"
            : "none",
        }}
      >
        {pages.map((page, index) => (
          <div
            key={index}
            className="flex-shrink-0 w-full h-full px-6 flex items-center justify-center"
          >
            <div
              className="w-full h-full max-w-3xl rounded-xl overflow-hidden shadow-reader-float relative"
              style={{
                backgroundColor: "var(--reader-surface)",
                color: "var(--reader-text)",
                transform: index === currentPage - 1 && isAnimating
                  ? "perspective(1000px) rotateY(-25deg)"
                  : "none",
                transformOrigin: "right center",
                transition: "transform 600ms cubic-bezier(.65, 0, .35, 1)",
              }}
            >
              {/* Page shadow overlay */}
              <div
                className="absolute inset-y-0 right-0 w-8 pointer-events-none"
                style={{
                  background: "linear-gradient(to left, rgba(0,0,0,0.08), transparent)",
                }}
              />
              <div className="h-full overflow-hidden p-8">
                {page}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Navigation indicators */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 pointer-events-none">
        <span className="text-sm opacity-70" style={{ color: "var(--reader-text-muted)" }}>
          {currentPage + 1} / {pages.length}
        </span>
        <div className="flex gap-1.5">
          {pages.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                i === currentPage ? "bg-primary w-4" : "bg-ink-300"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
