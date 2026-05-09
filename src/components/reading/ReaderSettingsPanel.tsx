"use client";

import { useReaderTheme, type ReaderTheme } from "./ReaderThemeContext";
import { IconSun, IconMoon, IconType } from "@/components/ui/icons";

// ── Types ─────────────────────────────────────────────────────────

type FontSizeLevel = "小" | "中" | "大";
type LineHeightLevel = "紧凑" | "标准" | "宽松";

// ── Constants ─────────────────────────────────────────────────────

const THEME_OPTIONS: { value: ReaderTheme; label: string; icon: React.ReactNode }[] = [
  {
    value: "light",
    label: "浅色",
    icon: <IconSun className="w-5 h-5" />,
  },
  {
    value: "sepia",
    label: "护眼",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <circle cx="12" cy="12" r="5" />
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
      </svg>
    ),
  },
  {
    value: "dark",
    label: "深色",
    icon: <IconMoon className="w-5 h-5" />,
  },
];

const FONT_SIZE_OPTIONS: { value: FontSizeLevel; label: string; sizeClass: string }[] = [
  { value: "小", label: "小", sizeClass: "text-sm" },
  { value: "中", label: "中", sizeClass: "text-base" },
  { value: "大", label: "大", sizeClass: "text-lg" },
];

const LINE_HEIGHT_OPTIONS: { value: LineHeightLevel; label: string }[] = [
  { value: "紧凑", label: "紧凑" },
  { value: "标准", label: "标准" },
  { value: "宽松", label: "宽松" },
];

// ── Mappings ──────────────────────────────────────────────────────

const FONT_SIZE_MAP: Record<import("./ReaderThemeContext").FontSize, FontSizeLevel> = {
  small: "小",
  medium: "中",
  large: "大",
};

const FONT_SIZE_REVERSE_MAP: Record<FontSizeLevel, import("./ReaderThemeContext").FontSize> = {
  "小": "small",
  "中": "medium",
  "大": "large",
};

const LINE_HEIGHT_MAP: Record<import("./ReaderThemeContext").LineHeight, LineHeightLevel> = {
  compact: "紧凑",
  standard: "标准",
  loose: "宽松",
};

const LINE_HEIGHT_REVERSE_MAP: Record<LineHeightLevel, import("./ReaderThemeContext").LineHeight> = {
  "紧凑": "compact",
  "标准": "standard",
  "宽松": "loose",
};

// ── Component ─────────────────────────────────────────────────────

export default function ReaderSettingsPanel({ onClose }: { onClose?: () => void }) {
  const { theme, setTheme, fontSize, setFontSize, lineHeight, setLineHeight } = useReaderTheme();

  const fontSizeLabel = FONT_SIZE_MAP[fontSize];
  const lineHeightLabel = LINE_HEIGHT_MAP[lineHeight];

  return (
    <div className="space-y-6 relative">
      {onClose && (
        <button
          onClick={onClose}
          className="absolute -top-2 -right-2 w-8 h-8 flex items-center justify-center rounded-full"
          style={{ backgroundColor: "var(--reader-surface)", border: "1px solid var(--reader-border)" }}
          aria-label="关闭设置"
        >
          <span className="text-sm">✕</span>
        </button>
      )}
      {/* ── Theme Selection ───────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-medium mb-3" style={{ color: "var(--reader-text-muted)" }}>
          主题
        </h3>
        <div className="flex gap-2">
          {THEME_OPTIONS.map((option) => {
            const isActive = theme === option.value;
            return (
              <button
                key={option.value}
                onClick={() => setTheme(option.value)}
                className={`flex-1 flex flex-col items-center justify-center gap-1.5 px-3 py-2.5 rounded-radius-md border transition-all duration-fast min-h-[44px] ${
                  isActive
                    ? "border-forest-500 bg-forest-50 text-forest-600"
                    : "border-transparent hover:bg-ink-50"
                }`}
                style={
                  isActive
                    ? {
                        borderColor: "var(--reader-accent)",
                        backgroundColor: "var(--reader-accent)",
                        color: "var(--reader-bg)",
                        opacity: 0.15,
                      }
                    : {
                        borderColor: "var(--reader-border)",
                        color: "var(--reader-text-muted)",
                      }
                }
                aria-label={`切换到${option.label}主题`}
                aria-pressed={isActive}
              >
                <span style={{ color: isActive ? "var(--reader-accent)" : "var(--reader-text-muted)" }}>
                  {option.icon}
                </span>
                <span
                  className="text-xs font-medium"
                  style={{ color: isActive ? "var(--reader-accent)" : "var(--reader-text-muted)" }}
                >
                  {option.label}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Font Size ─────────────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-medium mb-3" style={{ color: "var(--reader-text-muted)" }}>
          字体大小
        </h3>
        <div className="flex gap-2">
          {FONT_SIZE_OPTIONS.map((option) => {
            const isActive = fontSizeLabel === option.value;
            return (
              <button
                key={option.value}
                onClick={() => setFontSize(FONT_SIZE_REVERSE_MAP[option.value])}
                className={`flex-1 flex items-center justify-center px-3 py-2.5 rounded-radius-md border transition-all duration-fast min-h-[44px] ${
                  isActive
                    ? "border-forest-500 bg-forest-50"
                    : "border-transparent hover:bg-ink-50"
                }`}
                style={
                  isActive
                    ? {
                        borderColor: "var(--reader-accent)",
                        backgroundColor: "var(--reader-accent)",
                        opacity: 0.15,
                      }
                    : {
                        borderColor: "var(--reader-border)",
                      }
                }
                aria-label={`字体大小：${option.label}`}
                aria-pressed={isActive}
              >
                <span
                  className={`font-medium ${option.sizeClass}`}
                  style={{ color: isActive ? "var(--reader-accent)" : "var(--reader-text-muted)" }}
                >
                  {option.label}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Line Height ───────────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-medium mb-3" style={{ color: "var(--reader-text-muted)" }}>
          行高
        </h3>
        <div className="flex gap-2">
          {LINE_HEIGHT_OPTIONS.map((option) => {
            const isActive = lineHeightLabel === option.value;
            return (
              <button
                key={option.value}
                onClick={() => setLineHeight(LINE_HEIGHT_REVERSE_MAP[option.value])}
                className={`flex-1 flex items-center justify-center px-3 py-2.5 rounded-radius-md border transition-all duration-fast min-h-[44px] ${
                  isActive
                    ? "border-forest-500 bg-forest-50"
                    : "border-transparent hover:bg-ink-50"
                }`}
                style={
                  isActive
                    ? {
                        borderColor: "var(--reader-accent)",
                        backgroundColor: "var(--reader-accent)",
                        opacity: 0.15,
                      }
                    : {
                        borderColor: "var(--reader-border)",
                      }
                }
                aria-label={`行高：${option.label}`}
                aria-pressed={isActive}
              >
                <span
                  className="text-sm font-medium"
                  style={{ color: isActive ? "var(--reader-accent)" : "var(--reader-text-muted)" }}
                >
                  {option.label}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
