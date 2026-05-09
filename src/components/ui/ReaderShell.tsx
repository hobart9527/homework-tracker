"use client";

import type { ReactNode } from "react";
import { useState, isValidElement, cloneElement } from "react";
import { IconPanelLeft, IconSidebar } from "./icons";

// ── Types ─────────────────────────────────────────────────────────

export interface ReaderShellProps {
  /** Content rendered in the left rail (e.g. chapter list, TOC) */
  leftRail?: ReactNode;
  /** Main reading content — required */
  readerContent: ReactNode;
  /** Content rendered in the right rail (e.g. notes, dictionary) */
  rightRail?: ReactNode;
  /** Whether to show the left rail on desktop */
  showLeftRail?: boolean;
  /** Whether to show the right rail on desktop */
  showRightRail?: boolean;
  /** Reader theme — controls page background via CSS variables */
  theme?: "light" | "sepia" | "dark";
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────

/**
 * ReaderShell — immersive reading layout with responsive 3-column support.
 *
 * Responsive behavior:
 *   - iPad landscape (>= 1024px): three-column layout
 *       - Left rail:  min-w-[200px] max-w-[260px], collapsible
 *       - Center:     flex-1, max-w-[720px], reading content
 *       - Right rail: min-w-[200px] max-w-[260px], collapsible
 *   - iPad portrait (< 1024px): single column, left/right rails hidden
 *       - Floating bottom toolbar for rail toggles
 *
 * No top or bottom nav — fully immersive.
 *
 * Theme:
 *   - Page background controlled by reader theme CSS variables
 *   - Themes: light (white), sepia (cream-200), dark (forest-950)
 */
export default function ReaderShell({
  leftRail,
  readerContent,
  rightRail,
  showLeftRail: initialShowLeftRail = true,
  showRightRail: initialShowRightRail = false,
  theme = "sepia",
  className,
}: ReaderShellProps) {
  const [leftOpen, setLeftOpen] = useState(initialShowLeftRail);
  const [rightOpen, setRightOpen] = useState(initialShowRightRail);

  // Theme CSS variables defined inline so they apply to this component's scope
  const themeVariables: Record<string, string> =
    theme === "light"
      ? {
          "--reader-bg": "white",
          "--reader-surface": "white",
          "--reader-text": "#202124",
          "--reader-text-muted": "#80868B",
          "--reader-accent": "#56AB91",
          "--reader-border": "#E8EAED",
        }
      : theme === "sepia"
        ? {
            "--reader-bg": "#F1E8D2",
            "--reader-surface": "#FAF6EC",
            "--reader-text": "#202124",
            "--reader-text-muted": "#5F6368",
            "--reader-accent": "#3D8B76",
            "--reader-border": "#E5D4AB",
          }
        : {
            "--reader-bg": "#0A1B14",
            "--reader-surface": "#143328",
            "--reader-text": "#FDFCF8",
            "--reader-text-muted": "#9AA0A6",
            "--reader-accent": "#A8E6CF",
            "--reader-border": "#1F4D3F",
          };

  const themeBgStyle: React.CSSProperties = {
    backgroundColor: "var(--reader-bg)",
    color: "var(--reader-text)",
    ...themeVariables,
  };

  return (
    <div
      data-reader-theme={theme}
      className={`min-h-screen flex flex-col ${className || ""}`.trim()}
      style={themeBgStyle}
    >
      {/* ═══════════════════════════════════════════════════════════════
          DESKTOP: iPad landscape (>= 1024px) — Three-column layout
         ═══════════════════════════════════════════════════════════════ */}
      <div className="hidden lg:flex flex-1 justify-center">
        {/* ── Left Rail ────────────────────────────────────────────── */}
        {leftRail && (
          <aside
            className={`flex-shrink-0 border-r transition-all duration-med overflow-y-auto ${leftOpen ? "min-w-[200px] max-w-[260px] w-[240px] opacity-100" : "w-0 opacity-0 overflow-hidden"}`}
            style={{
              borderColor: "var(--reader-border)",
            }}
          >
            <div className="p-4">{leftRail}</div>
          </aside>
        )}

        {/* ── Center: Reading Content ──────────────────────────────── */}
        <main
          className="flex-1 max-w-[720px] mx-auto px-6 py-8"
          style={{
            backgroundColor: "var(--reader-surface)",
            boxShadow:
              "0 1px 0 rgba(0,0,0,0.04) inset, 0 -1px 0 rgba(0,0,0,0.04) inset, 0 0 32px rgba(0,0,0,0.06)",
            backgroundImage:
              theme === "sepia"
                ? `repeating-linear-gradient(
                    0deg,
                    transparent,
                    transparent 23px,
                    rgba(139, 115, 85, 0.04) 23px,
                    rgba(139, 115, 85, 0.04) 24px
                  ),
                  radial-gradient(
                    ellipse at 20% 30%,
                    rgba(160, 130, 90, 0.03) 0%,
                    transparent 50%
                  ),
                  radial-gradient(
                    ellipse at 80% 70%,
                    rgba(160, 130, 90, 0.03) 0%,
                    transparent 50%
                  )`
                : "none",
          }}
        >
          {readerContent}
        </main>

        {/* ── Right Rail ───────────────────────────────────────────── */}
        {rightRail && (
          <aside
            className={`flex-shrink-0 border-l transition-all duration-med overflow-y-auto ${rightOpen ? "min-w-[200px] max-w-[260px] w-[240px] opacity-100" : "w-0 opacity-0 overflow-hidden"}`}
            style={{
              borderColor: "var(--reader-border)",
            }}
          >
            <div className="p-4">{isValidElement(rightRail) ? cloneElement(rightRail, { onClose: () => setRightOpen(false) } as any) : rightRail}</div>
          </aside>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          MOBILE: iPad portrait (< 1024px) — Single column + floating toolbar
         ═══════════════════════════════════════════════════════════════ */}
      <div className="lg:hidden flex flex-col flex-1">
        {/* Reading content — full width */}
        <main
          className="flex-1 px-4 py-6"
          style={{ backgroundColor: "var(--reader-surface)" }}
        >
          {readerContent}
        </main>

        {/* Floating bottom toolbar for rail toggles */}
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-radius-xl shadow-elevation-floating z-50"
          style={{
            backgroundColor: "var(--reader-surface)",
            border: "1px solid var(--reader-border)",
          }}
        >
          {leftRail && (
            <button
              onClick={() => setLeftOpen(!leftOpen)}
              className={`flex items-center justify-center w-10 h-10 rounded-radius-md transition-colors duration-fast min-h-[44px] min-w-[44px] ${leftOpen ? "text-forest-500 bg-forest-50" : "text-ink-500 hover:bg-ink-50"}`}
              aria-label="Toggle left panel"
              aria-pressed={leftOpen}
            >
              <IconPanelLeft className="w-5 h-5" />
            </button>
          )}

          {/* Theme indicator / spacer */}
          <div
            className="w-px h-6"
            style={{ backgroundColor: "var(--reader-border)" }}
          />

          {rightRail && (
            <button
              onClick={() => setRightOpen(!rightOpen)}
              className={`flex items-center justify-center w-10 h-10 rounded-radius-md transition-colors duration-fast min-h-[44px] min-w-[44px] ${rightOpen ? "text-forest-500 bg-forest-50" : "text-ink-500 hover:bg-ink-50"}`}
              aria-label="Toggle right panel"
              aria-pressed={rightOpen}
            >
              <IconSidebar className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Mobile rail drawers (slide-up overlays) */}
        {leftRail && leftOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-ink-900/30 backdrop-blur-sm z-40"
              onClick={() => setLeftOpen(false)}
              aria-hidden="true"
            />
            {/* Drawer */}
            <div
              className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl max-h-[70vh] overflow-y-auto"
              style={{
                backgroundColor: "var(--reader-surface)",
                borderTop: "1px solid var(--reader-border)",
              }}
            >
              {/* Grab handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-ink-300" />
              </div>
              <div className="p-4">{leftRail}</div>
            </div>
          </>
        )}

        {rightRail && rightOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-ink-900/30 backdrop-blur-sm z-40"
              onClick={() => setRightOpen(false)}
              aria-hidden="true"
            />
            {/* Drawer */}
            <div
              className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl max-h-[70vh] overflow-y-auto"
              style={{
                backgroundColor: "var(--reader-surface)",
                borderTop: "1px solid var(--reader-border)",
              }}
            >
              {/* Grab handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-ink-300" />
              </div>
              <div className="p-4">{isValidElement(rightRail) ? cloneElement(rightRail, { onClose: () => setRightOpen(false) } as any) : rightRail}</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
