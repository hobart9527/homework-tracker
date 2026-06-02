"use client";

import { useTranslations } from "next-intl";
import { useReaderTheme, type ReaderTheme } from "./ReaderThemeContext";
import { IconSun, IconMoon, IconType } from "@/components/ui/icons";
import { Sun, X } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────

type FontSizeLevel = string;
type LineHeightLevel = string;

// ── Component ─────────────────────────────────────────────────────

export default function ReaderSettingsPanel({ onClose }: { onClose?: () => void }) {
  const t = useTranslations();
  const { theme, setTheme, fontSize, setFontSize, lineHeight, setLineHeight } = useReaderTheme();

  const THEME_OPTIONS: { value: ReaderTheme; label: string; icon: React.ReactNode }[] = [
    {
      value: "light",
      label: t("reading.readerSettings.light"),
      icon: <IconSun className="w-5 h-5" />,
    },
    {
      value: "sepia",
      label: t("reading.readerSettings.sepia"),
      icon: <Sun className="w-5 h-5" />,
    },
    {
      value: "dark",
      label: t("reading.readerSettings.dark"),
      icon: <IconMoon className="w-5 h-5" />,
    },
  ];

  const FONT_SIZE_OPTIONS: { value: FontSizeLevel; label: string; sizeClass: string }[] = [
    { value: "小", label: t("reading.readerSettings.small"), sizeClass: "text-sm" },
    { value: "中", label: t("reading.readerSettings.medium"), sizeClass: "text-base" },
    { value: "大", label: t("reading.readerSettings.large"), sizeClass: "text-lg" },
    { value: "特大", label: t("reading.readerSettings.xlarge"), sizeClass: "text-xl" },
  ];

  const LINE_HEIGHT_OPTIONS: { value: LineHeightLevel; label: string }[] = [
    { value: "紧凑", label: t("reading.readerSettings.compact") },
    { value: "标准", label: t("reading.readerSettings.standard") },
    { value: "宽松", label: t("reading.readerSettings.loose") },
  ];

  const FONT_SIZE_MAP: Record<import("./ReaderThemeContext").FontSize, FontSizeLevel> = {
    small: "小",
    medium: "中",
    large: "大",
    xlarge: "特大",
  };

  const FONT_SIZE_REVERSE_MAP: Record<FontSizeLevel, import("./ReaderThemeContext").FontSize> = {
    "小": "small",
    "中": "medium",
    "大": "large",
    "特大": "xlarge",
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

  const fontSizeLabel = FONT_SIZE_MAP[fontSize];
  const lineHeightLabel = LINE_HEIGHT_MAP[lineHeight];

  return (
    <div className="space-y-6 relative">
      {onClose && (
        <button
          onClick={onClose}
          className="absolute -top-2 -right-2 w-8 h-8 flex items-center justify-center rounded-full"
          style={{ backgroundColor: "var(--reader-surface)", border: "1px solid var(--reader-border)" }}
          aria-label={t("reading.readerSettings.closeSettings")}
        >
          <X className="w-4 h-4" />
        </button>
      )}
      {/* ── Theme Selection ───────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-medium mb-3" style={{ color: "var(--reader-text-muted)" }}>
          {t("reading.readerSettings.theme")}
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
                aria-label={t("reading.readerSettings.switchToTheme", { theme: option.label })}
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
          {t("reading.readerSettings.fontSize")}
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
                aria-label={t("reading.readerSettings.fontSizeLabel", { size: option.label })}
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
          {t("reading.readerSettings.lineHeight")}
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
                aria-label={t("reading.readerSettings.lineHeightLabel", { level: option.label })}
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
