"use client";

import { useState } from "react";
import { useReaderTheme } from "./ReaderThemeContext";

interface BottomReaderToolbarProps {
  onFontSizeChange: (delta: number) => void;
  onThemeCycle: () => void;
  onToggleToc: () => void;
  onToggleNotes: () => void;
}

export function BottomReaderToolbar({
  onFontSizeChange,
  onThemeCycle,
  onToggleToc,
  onToggleNotes,
}: BottomReaderToolbarProps) {
  const [expanded, setExpanded] = useState(false);
  const { theme } = useReaderTheme();

  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${
        expanded ? "w-[90%] max-w-md" : "w-auto"
      }`}
    >
      {/* Main toolbar */}
      <div
        className="flex items-center gap-2 px-4 py-3 rounded-2xl shadow-reader-float backdrop-blur-md"
        style={{
          backgroundColor: "rgba(var(--reader-surface-rgb), 0.9)",
          border: "1px solid var(--reader-border)",
        }}
      >
        {/* Font size controls */}
        <button
          onClick={() => onFontSizeChange(-1)}
          className="flex items-center justify-center w-10 h-10 rounded-xl transition-colors hover:bg-ink-100 min-h-[44px]"
          aria-label="减小字体"
        >
          <span className="text-lg">A-</span>
        </button>
        <button
          onClick={() => onFontSizeChange(1)}
          className="flex items-center justify-center w-10 h-10 rounded-xl transition-colors hover:bg-ink-100 min-h-[44px]"
          aria-label="增大字体"
        >
          <span className="text-xl">A+</span>
        </button>

        <div className="w-px h-6 bg-ink-200" />

        {/* Theme toggle */}
        <button
          onClick={onThemeCycle}
          className="flex items-center justify-center w-10 h-10 rounded-xl transition-colors hover:bg-ink-100 min-h-[44px]"
          aria-label="切换主题"
        >
          <span className="text-lg">
            {theme === "dark" ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            ) : theme === "sepia" ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <circle cx="12" cy="12" r="5" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
            )}
          </span>
        </button>

        <div className="w-px h-6 bg-ink-200" />

        {/* TOC */}
        <button
          onClick={onToggleToc}
          className="flex items-center justify-center w-10 h-10 rounded-xl transition-colors hover:bg-ink-100 min-h-[44px]"
          aria-label="目录"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Notes */}
        <button
          onClick={onToggleNotes}
          className="flex items-center justify-center w-10 h-10 rounded-xl transition-colors hover:bg-ink-100 min-h-[44px]"
          aria-label="笔记"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
