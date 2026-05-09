"use client";

import React from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkeletonShellProps {
  children: React.ReactNode;
  className?: string;
}

export interface SkeletonBlockProps {
  className?: string;
  rounded?: "none" | "sm" | "md" | "lg" | "xl" | "full";
  animate?: "shimmer" | "pulse" | "none";
}

export interface SkeletonCircleProps {
  className?: string;
  size?: number;
  animate?: "shimmer" | "pulse" | "none";
}

export interface SkeletonTextProps {
  className?: string;
  lines?: number;
  animate?: "shimmer" | "pulse" | "none";
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const roundedMap = {
  none: "rounded-none",
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  full: "rounded-full",
} as const;

const animateMap = {
  shimmer: "animate-shimmer bg-gradient-to-r from-ink-100 via-ink-50 to-ink-100",
  pulse: "animate-pulse bg-ink-100",
  none: "bg-ink-100",
} as const;

function joinClasses(...classes: (string | undefined | false)[]) {
  return classes.filter(Boolean).join(" ").trim();
}

// ---------------------------------------------------------------------------
// SkeletonShell — container for skeleton layouts
// ---------------------------------------------------------------------------

export function SkeletonShell({ children, className }: SkeletonShellProps) {
  return (
    <div
      className={joinClasses(
        "pointer-events-none select-none",
        className
      )}
      aria-hidden="true"
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SkeletonBlock — rectangular block
// ---------------------------------------------------------------------------

export function SkeletonBlock({
  className,
  rounded = "md",
  animate = "shimmer",
}: SkeletonBlockProps) {
  return (
    <div
      className={joinClasses(
        "block",
        roundedMap[rounded],
        animateMap[animate],
        className
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// SkeletonCircle — circular placeholder
// ---------------------------------------------------------------------------

export function SkeletonCircle({
  className,
  size,
  animate = "shimmer",
}: SkeletonCircleProps) {
  const sizeStyle = size ? { width: size, height: size } : undefined;

  return (
    <div
      className={joinClasses(
        "rounded-full",
        animateMap[animate],
        className
      )}
      style={sizeStyle}
    />
  );
}

// ---------------------------------------------------------------------------
// SkeletonText — text-line placeholder with staggered widths
// ---------------------------------------------------------------------------

const defaultLineWidths = [
  "w-full",
  "w-[92%]",
  "w-[84%]",
  "w-[96%]",
  "w-[76%]",
  "w-[88%]",
];

export function SkeletonText({
  className,
  lines = 1,
  animate = "shimmer",
}: SkeletonTextProps) {
  return (
    <div className={joinClasses("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }).map((_, index) => (
        <div
          key={index}
          className={joinClasses(
            "h-4 rounded-md",
            animateMap[animate],
            defaultLineWidths[index % defaultLineWidths.length]
          )}
        />
      ))}
    </div>
  );
}
