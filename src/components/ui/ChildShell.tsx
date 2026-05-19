"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconList,
  IconChart,
  IconStar,
  IconBookOpen,
} from "./icons";

// ── Types ─────────────────────────────────────────────────────────

export interface NavTab {
  label: string;
  href: string;
  icon: ReactNode;
  activeIcon?: ReactNode;
}

export interface ChildShellProps {
  children: ReactNode;
  showNav?: boolean;
  hero?: ReactNode;
  className?: string;
}

// ── Default tab configuration ─────────────────────────────────────

const DEFAULT_TABS: NavTab[] = [
  {
    label: "今日",
    href: "/",
    icon: <IconList className="w-6 h-6" />,
  },
  {
    label: "进度",
    href: "/progress",
    icon: <IconChart className="w-6 h-6" />,
  },
  {
    label: "积分",
    href: "/rewards",
    icon: <IconStar className="w-6 h-6" />,
  },
  {
    label: "阅读",
    href: "/reading",
    icon: <IconBookOpen className="w-6 h-6" />,
  },
];

// ── Component ─────────────────────────────────────────────────────

/**
 * ChildShell — iPad-optimized layout shell for the child role.
 *
 * Features:
 *   - Bottom fixed nav bar (h-16 + pb-safe) with 4 tabs
 *   - Optional hero area at top (for "今日" page priority display)
 *   - Content area with pb-20 to clear bottom nav
 *   - Warm cream-50 page background
 *
 * Tokens:
 *   - bg-cream-50  → page background
 *   - bg-white     → nav bar background
 *   - forest-500   → active tab indicator
 *   - ink-200      → nav top border
 */
export default function ChildShell({
  children,
  showNav = true,
  hero,
  className,
}: ChildShellProps) {
  const pathname = usePathname();

  return (
    <div className={`min-h-screen bg-cream-50 flex flex-col ${className || ""}`.trim()}>
      {/* ── Optional Hero Area ─────────────────────────────────────── */}
      {hero && (
        <div className="w-full flex-shrink-0">{hero}</div>
      )}

      {/* ── Main Content ───────────────────────────────────────────── */}
      <main className={`flex-1 ${showNav ? "pb-20" : ""}`.trim()}>{children}</main>

      {/* ── Bottom Fixed Nav Bar ───────────────────────────────────── */}
      {showNav && (
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-ink-300 z-50 safe-area-pb">
          <div className="h-16 flex items-center justify-around max-w-5xl mx-auto px-4">
            {DEFAULT_TABS.map(({ href, label, icon }) => {
              const isActive =
                href === "/"
                  ? pathname === "/"
                  : pathname?.startsWith(href);

              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex flex-col items-center justify-center gap-0.5 min-w-[44px] min-h-[44px] transition-colors duration-fast ${isActive ? "text-forest-500" : "text-ink-400 hover:text-ink-600"}`}
                  aria-current={isActive ? "page" : undefined}
                >
                  {icon}
                  <span className="text-ui-xs">{label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
