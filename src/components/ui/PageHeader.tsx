import type { ReactNode } from "react";

interface PageHeaderProps {
  skin: "parent" | "child";
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  kicker?: string;
  className?: string;
}

/**
 * PageHeader — layout primitive for page top headers.
 *
 * - parent: minimal, dense, kicker in ink-500 uppercase tracking-wide
 * - child: hero gradient bg, large title, optional emoji decoration
 *
 * Usage:
 *   <PageHeader skin="parent" title="Dashboard" kicker="Overview" />
 *   <PageHeader skin="child" title="今日作业" subtitle="加油！" />
 */
export default function PageHeader({
  skin,
  title,
  subtitle,
  actions,
  kicker,
  className = "",
}: PageHeaderProps) {
  if (skin === "parent") {
    return (
      <header
        className={`px-4 py-4 md:px-6 md:py-5 ${className}`.trim()}
      >
        <div className="max-w-7xl mx-auto flex items-end justify-between gap-4">
          <div className="flex-1 min-w-0">
            {kicker && (
              <span className="block text-xs font-medium text-ink-500 tracking-wide uppercase mb-1">
                {kicker}
              </span>
            )}
            <h1 className="text-xl font-semibold text-ink-800 tracking-tight">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1 text-sm text-ink-500">{subtitle}</p>
            )}
          </div>
          {actions && <div className="flex-shrink-0">{actions}</div>}
        </div>
      </header>
    );
  }

  // child skin — hero style
  return (
    <header
      className={`bg-gradient-to-br from-cream-100 to-coral-50 px-4 py-8 md:px-6 md:py-10 ${className}`.trim()}
    >
      <div className="max-w-5xl mx-auto">
        {kicker && (
          <span className="inline-block text-sm font-medium text-coral-600 tracking-wide uppercase mb-2">
            {kicker}
          </span>
        )}
        <h1 className="text-3xl md:text-4xl font-bold text-ink-800 tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 text-base text-ink-600">{subtitle}</p>
        )}
        {actions && <div className="mt-4 flex gap-2">{actions}</div>}
      </div>
    </header>
  );
}
