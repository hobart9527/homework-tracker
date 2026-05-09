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
            {theme === "dark" ? "🌙" : theme === "sepia" ? "👁️" : "☀️"}
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
