import type { ReactNode } from "react";

interface SectionCardProps {
  skin: "parent" | "child";
  level: "raised" | "elevated" | "hero";
  padding?: "sm" | "md" | "lg";
  children: ReactNode;
  className?: string;
}

/**
 * SectionCard — surface primitive that renders the correct
 * bg + ring + shadow + radius + padding combo for a given skin+level.
 *
 * Surface map (design-system.md §3):
 *   parent raised:   white, ring-ink-200,   shadow-none,              radius-md
 *   parent elevated: white, ring-ink-200,   shadow-elevation-floating, radius-lg
 *   child raised:    white, ring-cream-200/40, shadow-none,              radius-lg
 *   child elevated:  white, ring-cream-200/60, shadow-elevation-floating, radius-xl
 *   child hero:      gradient cream-100→coral-50, shadow-elevation-floating, radius-2xl
 *
 * Usage:
 *   <SectionCard skin="parent" level="raised">…</SectionCard>
 *   <SectionCard skin="child" level="hero" padding="lg">…</SectionCard>
 */
export default function SectionCard({
  skin,
  level,
  padding = "md",
  children,
  className = "",
}: SectionCardProps) {
  const paddingMap: Record<NonNullable<typeof padding>, string> = {
    sm: "p-3",
    md: "p-4",
    lg: "p-6",
  };

  const surfaceMap: Record<
    typeof skin,
    Record<typeof level, string>
  > = {
    parent: {
      raised:
        "bg-white ring-1 ring-ink-200 shadow-none rounded-radius-md",
      elevated:
        "bg-white ring-1 ring-ink-200 shadow-elevation-floating rounded-radius-lg",
      hero:
        "bg-white ring-1 ring-ink-200 shadow-elevation-floating rounded-radius-xl",
    },
    child: {
      raised:
        "bg-white ring-1 ring-cream-200/40 shadow-none rounded-radius-lg",
      elevated:
        "bg-white ring-1 ring-cream-200/60 shadow-elevation-floating rounded-radius-xl",
      hero:
        "bg-gradient-to-br from-cream-100 to-coral-50 shadow-elevation-floating rounded-radius-2xl",
    },
  };

  const classes = [
    surfaceMap[skin][level],
    paddingMap[padding],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <div className={classes}>{children}</div>;
}
