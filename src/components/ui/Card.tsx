import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  skin?: "parent" | "child";
  level?: "raised" | "elevated";
  interactive?: boolean;
}

/**
 * Card — tokenized surface primitive.
 *
 * Renders the correct bg + ring + shadow + radius combo for a given skin+level.
 *
 * Surface map:
 *   parent raised:    white, ring-ink-200,   shadow-none,              radius-lg
 *   parent elevated:  white, ring-ink-200,   shadow-elevation-floating, radius-xl
 *   child raised:     white, ring-cream-200/40, shadow-none,              radius-xl
 *   child elevated:   white, ring-cream-200/60, shadow-elevation-floating, radius-xl
 */
export function Card({
  children,
  className = "",
  skin = "parent",
  level = "raised",
  interactive = false,
  onClick,
  ...props
}: CardProps) {
  const surfaceMap: Record<
    typeof skin,
    Record<typeof level, string>
  > = {
    parent: {
      raised:
        "bg-white ring-1 ring-ink-200 shadow-none rounded-radius-md",
      elevated:
        "bg-white ring-1 ring-ink-200 shadow-elevation-floating rounded-radius-xl",
    },
    child: {
      raised:
        "bg-white ring-1 ring-cream-200/40 shadow-none rounded-radius-xl",
      elevated:
        "bg-white ring-1 ring-cream-200/60 shadow-elevation-floating rounded-radius-xl",
    },
  };

  const interactiveStyles = interactive || onClick
    ? "cursor-pointer hover:shadow-elevation-floating transition-shadow duration-fast"
    : "";

  return (
    <div
      className={`${surfaceMap[skin][level]} ${interactiveStyles} ${className}`.trim()}
      onClick={onClick}
      {...props}
    >
      {children}
    </div>
  );
}
