"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

// ── Types ─────────────────────────────────────────────────────────

export type ReaderTheme = "light" | "sepia" | "dark" | "auto";

export type FontSize = "small" | "medium" | "large" | "xlarge";
export type LineHeight = "compact" | "standard" | "loose";

export interface ReaderSettings {
  theme: ReaderTheme;
  fontSize: FontSize;
  lineHeight: LineHeight;
}

export interface ReaderThemeContextValue {
  theme: ReaderTheme;
  setTheme: (theme: ReaderTheme) => void;
  fontSize: FontSize;
  setFontSize: (fontSize: FontSize) => void;
  lineHeight: LineHeight;
  setLineHeight: (lineHeight: LineHeight) => void;
}

// ── Constants ─────────────────────────────────────────────────────

const STORAGE_KEY = "hw-reader-settings-v1";

const DEFAULT_SETTINGS: ReaderSettings = {
  theme: "sepia",
  fontSize: "medium",
  lineHeight: "standard",
};

// ── Helpers ───────────────────────────────────────────────────────

export function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function resolveTheme(theme: ReaderTheme): "light" | "sepia" | "dark" {
  if (theme === "auto") return getSystemTheme();
  return theme;
}

function loadSettings(): ReaderSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ReaderSettings>;
    return {
      theme: (parsed.theme ?? DEFAULT_SETTINGS.theme) as ReaderTheme,
      fontSize: (parsed.fontSize ?? DEFAULT_SETTINGS.fontSize) as FontSize,
      lineHeight: (parsed.lineHeight ?? DEFAULT_SETTINGS.lineHeight) as LineHeight,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings: ReaderSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore SSR / privacy mode / quota errors
  }
}

// ── Context ───────────────────────────────────────────────────────

const ReaderThemeContext = createContext<ReaderThemeContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────

export function ReaderThemeProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ReaderSettings>(loadSettings);

  const { theme, fontSize, lineHeight } = settings;

  const setTheme = useCallback((newTheme: ReaderTheme) => {
    setSettings((prev) => {
      const next = { ...prev, theme: newTheme };
      saveSettings(next);
      return next;
    });
  }, []);

  const setFontSize = useCallback((newFontSize: FontSize) => {
    setSettings((prev) => {
      const next = { ...prev, fontSize: newFontSize };
      saveSettings(next);
      return next;
    });
  }, []);

  const setLineHeight = useCallback((newLineHeight: LineHeight) => {
    setSettings((prev) => {
      const next = { ...prev, lineHeight: newLineHeight };
      saveSettings(next);
      return next;
    });
  }, []);

  // Sync on mount in case localStorage changed since initial load
  useEffect(() => {
    const next = loadSettings();
    setSettings(next);
  }, []);

  // Listen for system theme changes when in auto mode
  useEffect(() => {
    if (theme !== "auto") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      // Force re-render by updating settings with same value
      setSettings((prev) => ({ ...prev }));
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  return (
    <ReaderThemeContext.Provider
      value={{ theme, setTheme, fontSize, setFontSize, lineHeight, setLineHeight }}
    >
      {children}
    </ReaderThemeContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────

export function useReaderTheme(): ReaderThemeContextValue {
  const context = useContext(ReaderThemeContext);
  if (!context) {
    throw new Error(
      "useReaderTheme must be used within a ReaderThemeProvider"
    );
  }
  return context;
}
