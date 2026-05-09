import type { ReactNode } from "react";

interface PageShellProps {
  skin: "parent" | "child" | "reader";
  children: ReactNode;
  className?: string;
}

/**
 * PageShell — layout primitive that renders the correct page background
 * and bottom nav spacing based on skin.
 *
 * Usage:
 *   <PageShell skin="parent">…</PageShell>
 *   <PageShell skin="child">…</PageShell>
 *   <PageShell skin="reader">…</PageShell>
 */
export default function PageShell({ skin, children, className = "" }: PageShellProps) {
  const baseClasses = "min-h-screen";

  const skinClasses: Record<typeof skin, string> = {
    parent: "bg-forest-50",
    child: "bg-cream-50 pb-20",
    reader: "",
  };

  return (
    <div className={`${baseClasses} ${skinClasses[skin]} ${className}`.trim()}>
      {children}
    </div>
  );
}
