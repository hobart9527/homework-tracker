"use client";

import { useRef, useCallback, type ReactNode } from "react";

interface GestureOverlayProps {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onPinchIn?: () => void;
  onPinchOut?: () => void;
  onDoubleTap?: () => void;
  onLongPress?: (x: number, y: number) => void;
  children: ReactNode;
}

export function GestureOverlay({
  onSwipeLeft,
  onSwipeRight,
  onPinchIn,
  onPinchOut,
  onDoubleTap,
  onLongPress,
  children,
}: GestureOverlayProps) {
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialPinchDistance = useRef<number | null>(null);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };

      longPressTimerRef.current = setTimeout(() => {
        onLongPress?.(touch.clientX, touch.clientY);
      }, 500);
    } else if (e.touches.length === 2) {
      clearLongPress();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      initialPinchDistance.current = Math.sqrt(dx * dx + dy * dy);
    }
  }, [onLongPress, clearLongPress]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1 && touchStartRef.current) {
      // Cancel long press if moved too much
      const dx = e.touches[0].clientX - touchStartRef.current.x;
      const dy = e.touches[0].clientY - touchStartRef.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > 10) {
        clearLongPress();
      }
    }
  }, [clearLongPress]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    clearLongPress();

    if (e.changedTouches.length === 1 && touchStartRef.current) {
      const touch = e.changedTouches[0];
      const start = touchStartRef.current;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      const dt = Date.now() - start.time;

      // Swipe detection
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50 && dt < 300) {
        if (dx > 0) {
          onSwipeRight?.();
        } else {
          onSwipeLeft?.();
        }
      }

      // Double tap detection
      if (dt < 200 && Math.abs(dx) < 10 && Math.abs(dy) < 10) {
        const now = Date.now();
        if (lastTapRef.current && now - lastTapRef.current.time < 300) {
          const tapDx = touch.clientX - lastTapRef.current.x;
          const tapDy = touch.clientY - lastTapRef.current.y;
          if (Math.sqrt(tapDx * tapDx + tapDy * tapDy) < 30) {
            onDoubleTap?.();
          }
        }
        lastTapRef.current = { time: now, x: touch.clientX, y: touch.clientY };
      }

      touchStartRef.current = null;
    }

    if (e.touches.length < 2) {
      initialPinchDistance.current = null;
    }
  }, [onSwipeLeft, onSwipeRight, onDoubleTap, clearLongPress]);

  return (
    <div
      className="touch-pan-y"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {children}
    </div>
  );
}
