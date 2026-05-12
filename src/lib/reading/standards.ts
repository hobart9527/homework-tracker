/**
 * Reading Level Standards — Single Source of Truth
 *
 * Sources:
 *   - English: RAZ-Kids levels A-Z, Lexile Grade Level Charts (hub.lexile.com)
 *   - Chinese: 新课标小学语文课程标准 各年级阅读量参考
 *
 * Data source: config/reading-standards.json
 * To adjust generation targets: edit the JSON file only.
 * Both content-generator.ts and quality-gate.ts import from here.
 */

import standardsData from "../../../config/reading-standards.json";

export type WordCountRange = { min: number; max: number };

// ─────────────────────────────────────────────
// Raw JSON data interfaces
// ─────────────────────────────────────────────

interface RawEnglishGradeData {
  razLevel: string;
  wordCountMin: number;
  wordCountMax: number;
  wpm: number;
  lexileScore: number;
}

interface RawChineseGradeData {
  charCountMin: number;
  charCountMax: number;
  wpm: number;
}

interface RawStandardsData {
  english: Record<string, RawEnglishGradeData>;
  chinese: Record<string, RawChineseGradeData>;
}

// ─────────────────────────────────────────────
// 1. Re-export standards from JSON with computed fields
// ─────────────────────────────────────────────

export const ENGLISH_STANDARDS: Record<number, EnglishGradeStandard> = Object.fromEntries(
  Object.entries((standardsData as RawStandardsData).english).map(([grade, data]) => [
    Number(grade),
    {
      razLevel: data.razLevel,
      wordCountRange: { min: data.wordCountMin, max: data.wordCountMax },
      wpm: data.wpm,
      readingMinutes: {
        min: Math.ceil(data.wordCountMin / data.wpm),
        max: Math.ceil(data.wordCountMax / data.wpm),
      },
      lexileScore: data.lexileScore,
    },
  ])
);

export const CHINESE_STANDARDS: Record<number, ChineseGradeStandard> = Object.fromEntries(
  Object.entries((standardsData as RawStandardsData).chinese).map(([grade, data]) => [
    Number(grade),
    {
      wordCountRange: { min: data.charCountMin, max: data.charCountMax },
      charCountRange: { min: data.charCountMin, max: data.charCountMax },
      wpm: data.wpm,
      readingMinutes: {
        min: Math.ceil(data.charCountMin / data.wpm),
        max: Math.ceil(data.charCountMax / data.wpm),
      },
    },
  ])
);

// ─────────────────────────────────────────────
// 2. Helper functions
// ─────────────────────────────────────────────

export function getEnglishStandard(grade: number): EnglishGradeStandard {
  const g = Math.min(Math.max(grade, 1), 8);
  return ENGLISH_STANDARDS[g];
}

export function getChineseStandard(grade: number): ChineseGradeStandard {
  const g = Math.min(Math.max(grade, 1), 8);
  return CHINESE_STANDARDS[g];
}

export function getWordCountRange(
  language: "en" | "zh",
  grade: number
): WordCountRange {
  return language === "en"
    ? getEnglishStandard(grade).wordCountRange
    : getChineseStandard(grade).charCountRange; // Chinese uses char count
}

export function getWPM(language: "en" | "zh", grade: number): number {
  return language === "en"
    ? getEnglishStandard(grade).wpm
    : getChineseStandard(grade).wpm;
}

export function getReadingMinutes(
  language: "en" | "zh",
  grade: number
): { min: number; max: number } {
  return language === "en"
    ? getEnglishStandard(grade).readingMinutes
    : getChineseStandard(grade).readingMinutes;
}

// ─────────────────────────────────────────────
// 3. Type definitions (derived from JSON structure)
// ─────────────────────────────────────────────

export interface EnglishGradeStandard {
  razLevel: string;
  wordCountRange: { min: number; max: number };
  wpm: number;                          // words per minute (reading fluency)
  readingMinutes: { min: number; max: number };
  lexileScore: number;                  // typical mid-point Lexile score
}

export interface ChineseGradeStandard {
  wordCountRange: { min: number; max: number };
  charCountRange: { min: number; max: number }; // for Chinese char counting
  wpm: number;                          // 字/分钟
  readingMinutes: { min: number; max: number };
}