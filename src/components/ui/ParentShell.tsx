"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  IconList,
  IconDocument,
  IconFox,
  IconSettings,
} from "./icons";

// ── Types ─────────────────────────────────────────────────────────

export interface SidebarItem {
  label: string;
  href: string;
  icon: ReactNode;
}

export interface ParentShellProps {
  children: ReactNode;
  sidebarItems?: SidebarItem[];
  activePath?: string;
  className?: string;
}

// ── Default navigation items ──────────────────────────────────────

const DEFAULT_SIDEBAR_ITEMS: SidebarItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: <IconList className="w-5 h-5" /> },
  { label: "Homework", href: "/homework", icon: <IconDocument className="w-5 h-5" /> },
  { label: "Children", href: "/children", icon: <IconFox className="w-5 h-5" /> },
  { label: "Settings", href: "/settings", icon: <IconSettings className="w-5 h-5" /> },
];

// ── Component ─────────────────────────────────────────────────────

/**
 * ParentShell — iPad-optimized layout shell for the parent role.
 *
 * Responsive behavior:
 *   - iPad landscape (>= 1024px): fixed left sidebar (240px) + scrollable content area
 *   - iPad portrait (< 1024px): top horizontal nav bar, sidebar hidden, full-width content
 *
 * Tokens:
 *   - bg-forest-50  → page background
 *   - bg-white      → sidebar / nav background
 *   - border-ink-200 → dividers
 */
export default function ParentShell({
  children,
  sidebarItems = DEFAULT_SIDEBAR_ITEMS,
  activePath,
  className,
}: ParentShellProps) {
  return (
    <div className={`min-h-screen bg-forest-50 flex ${className || ""}`.trim()}>
      {/* ── Desktop Sidebar (iPad landscape >= 1024px) ─────────────── */}
      <aside className="hidden lg:flex flex-col w-60 bg-white border-r border-ink-200 fixed inset-y-0 left-0 z-40">
        {/* Brand */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-ink-200">
          <div className="w-9 h-9 rounded-radius-md bg-forest-500 flex items-center justify-center text-white">
            <IconFox className="w-5 h-5" />
          </div>
          <span className="font-ui-display font-semibold text-ink-800 text-ui-lg">
            作业小管家
          </span>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {sidebarItems.map((item) => {
            const isActive = activePath === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-radius-md text-left transition-colors duration-fast min-h-[44px] ${isActive ? "bg-forest-50 text-forest-700 font-medium" : "text-ink-600 hover:bg-ink-50 hover:text-ink-800"}`}
              >
                <span
                  className={`flex-shrink-0 ${isActive ? "text-forest-500" : "text-ink-400"}`}
                >
                  {item.icon}
                </span>
                <span className="text-ui-sm">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* ── Mobile Top Nav (iPad portrait < 1024px) ────────────────── */}
      <nav className="lg:hidden fixed top-0 left-0 right-0 bg-white border-b border-ink-200 z-40">
        <div className="flex items-center justify-between px-4 py-3">
          {/* Brand */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-radius-sm bg-forest-500 flex items-center justify-center text-white">
              <IconFox className="w-4 h-4" />
            </div>
            <span className="font-ui-display font-semibold text-ink-800 text-ui-base">
              作业小管家
            </span>
          </div>
        </div>

        {/* Horizontal nav items */}
        <div className="flex items-center justify-around px-2 pb-2">
          {sidebarItems.map((item) => {
            const isActive = activePath === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center px-3 py-1.5 rounded-radius-md transition-colors duration-fast min-w-[44px] min-h-[44px] ${isActive ? "text-forest-600" : "text-ink-400 hover:text-ink-600"}`}
              >
                <span className={isActive ? "text-forest-500" : ""}>
                  {item.icon}
                </span>
                <span className="text-ui-xs mt-0.5">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ── Main Content Area ──────────────────────────────────────── */}
      <main className="flex-1 lg:ml-60">
        {/* Mobile: offset for top nav */}
        <div className="lg:hidden h-[108px]" />
        <div className="p-4 lg:p-6">{children}</div>
      </main>
    </div>
  );
}
