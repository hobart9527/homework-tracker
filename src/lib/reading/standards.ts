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
  chapterCount: number;
  questionsPerChapter: number;
  wordsPerChapter: { min: number; max: number };
  blooms: { literal: number; infer: number; evaluate: number; synthesize: number };
  syntax: { simple: number; compound: number; complex: number };
  vocab: string;
  paragraphSentencesMin?: number;
  paragraphSentencesMax?: number;
  allowOpinion?: boolean;
  themeWords?: number;
}

interface RawChineseGradeData {
  charCountMin: number;
  charCountMax: number;
  wpm: number;
  chapterCount: number;
  questionsPerChapter: number;
  wordsPerChapter: { min: number; max: number };
  blooms: { literal: number; infer: number; evaluate: number; synthesize: number };
  syntax: { simple: number; compound: number; complex: number };
  vocab: string;
}

interface RawStandardsData {
  english: Record<string, RawEnglishGradeData>;
  chinese: Record<string, RawChineseGradeData>;
}

// ─────────────────────────────────────────────
// 1. Re-export standards from JSON with computed fields
// ─────────────────────────────────────────────

function isEnglishGradeData(v: unknown): v is RawEnglishGradeData {
  return (
    v !== null &&
    typeof v === "object" &&
    "razLevel" in v &&
    typeof (v as Record<string, unknown>).razLevel === "string"
  );
}

function isChineseGradeData(v: unknown): v is RawChineseGradeData {
  return (
    v !== null &&
    typeof v === "object" &&
    "charCountMin" in v &&
    typeof (v as Record<string, unknown>).charCountMin === "number"
  );
}

export const ENGLISH_STANDARDS: Record<number, EnglishGradeStandard> = Object.fromEntries(
  Object.entries((standardsData as unknown as RawStandardsData).english)
    .filter(([, data]) => isEnglishGradeData(data))
    .map(([grade, data]) => [
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
        chapterCount: data.chapterCount,
        questionsPerChapter: data.questionsPerChapter,
        wordsPerChapter: data.wordsPerChapter,
        blooms: data.blooms,
        syntax: data.syntax,
        vocab: data.vocab,
        paragraphSentencesMin: data.paragraphSentencesMin ?? 3,
        paragraphSentencesMax: data.paragraphSentencesMax ?? 7,
        allowOpinion: data.allowOpinion ?? false,
        themeWords: data.themeWords ?? 4,
      },
    ])
);

export const CHINESE_STANDARDS: Record<number, ChineseGradeStandard> = Object.fromEntries(
  Object.entries((standardsData as unknown as RawStandardsData).chinese)
    .filter(([, data]) => isChineseGradeData(data))
    .map(([grade, data]) => [
      Number(grade),
      {
        wordCountRange: { min: data.charCountMin, max: data.charCountMax },
        charCountRange: { min: data.charCountMin, max: data.charCountMax },
        wpm: data.wpm,
        readingMinutes: {
          min: Math.ceil(data.charCountMin / data.wpm),
          max: Math.ceil(data.charCountMax / data.wpm),
        },
        chapterCount: data.chapterCount ?? 1,
        questionsPerChapter: data.questionsPerChapter ?? 5,
        wordsPerChapter: data.wordsPerChapter ?? { min: data.charCountMin, max: data.charCountMax },
        blooms: data.blooms ?? { literal: 4, infer: 1, evaluate: 0, synthesize: 0 },
        syntax: data.syntax ?? { simple: 70, compound: 30, complex: 0 },
        vocab: data.vocab ?? "",
        paragraphSentencesMin: 3,
        paragraphSentencesMax: 7,
        allowOpinion: false,
        themeWords: 4,
      },
    ])
);

// ─────────────────────────────────────────────
// 2. Helper functions
// ─────────────────────────────────────────────

export function getEnglishStandard(grade: number): EnglishGradeStandard {
  const g = Math.min(Math.max(grade, 1), 10);
  return ENGLISH_STANDARDS[g];
}

export function getChineseStandard(grade: number): ChineseGradeStandard {
  const g = Math.min(Math.max(grade, 1), 10);
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
// 4. New helpers: chapter & generation config
// ─────────────────────────────────────────────

export function getChapterCount(grade: number, language: "en" | "zh"): number {
  return language === "en"
    ? getEnglishStandard(grade).chapterCount
    : getChineseStandard(grade).chapterCount;
}

export function getQuestionsPerChapter(grade: number, language: "en" | "zh"): number {
  return language === "en"
    ? getEnglishStandard(grade).questionsPerChapter
    : getChineseStandard(grade).questionsPerChapter;
}

export function getTotalQuestionCount(grade: number, language: "en" | "zh"): number {
  const chapters = getChapterCount(grade, language);
  const perChapter = getQuestionsPerChapter(grade, language);
  return chapters * perChapter;
}

export function getBloomDistribution(grade: number, language: "en" | "zh"): { literal: number; infer: number; evaluate: number; synthesize: number } {
  return language === "en"
    ? getEnglishStandard(grade).blooms
    : getChineseStandard(grade).blooms;
}

export function getSyntaxDistribution(grade: number, language: "en" | "zh"): { simple: number; compound: number; complex: number } {
  return language === "en"
    ? getEnglishStandard(grade).syntax
    : getChineseStandard(grade).syntax;
}

export function getVocabScope(grade: number, language: "en" | "zh"): string {
  return language === "en"
    ? getEnglishStandard(grade).vocab
    : getChineseStandard(grade).vocab;
}

export function getWordsPerChapter(grade: number, language: "en" | "zh"): { min: number; max: number } {
  return language === "en"
    ? getEnglishStandard(grade).wordsPerChapter
    : getChineseStandard(grade).wordsPerChapter;
}

// ─────────────────────────────────────────────
// 5. Question type map (SSOT from reading-standards.json)
// ─────────────────────────────────────────────

export interface QuestionTypeEntry {
  bloom: string;
  criticalThinking: boolean;
  en: string;
  zh: string;
  prompt_en: string;
  prompt_zh: string;
}

const QUESTION_TYPE_MAP: Record<string, QuestionTypeEntry> =
  (standardsData as unknown as { questionTypes: Record<string, QuestionTypeEntry> }).questionTypes;

/**
 * Returns the canonical question type map. Each key is a question_type string
 * (e.g. "detail", "inference", "main_idea", "sequence", "vocabulary").
 *
 * `criticalThinking: true` means the type counts toward the IB critical-thinking
 * ratio (inference + main_idea + sequence).
 */
export function getQuestionTypeMap(): Record<string, QuestionTypeEntry> {
  return QUESTION_TYPE_MAP;
}

/**
 * Returns the set of question_type values that count as critical thinking.
 */
export function getCriticalThinkingTypes(): Set<string> {
  return new Set(
    Object.entries(QUESTION_TYPE_MAP)
      .filter(([, entry]) => entry.criticalThinking)
      .map(([type]) => type)
  );
}

/**
 * Given a bloom level key (literal/infer/evaluate/synthesize), return the
 * canonical question_type for the target language.
 */
export function bloomToQuestionType(bloom: string, language: "en" | "zh"): string {
  for (const entry of Object.values(QUESTION_TYPE_MAP)) {
    if (entry.bloom === bloom) return entry[language];
  }
  return "detail";
}

/**
 * Canonical question types matching the DB CHECK constraint and the SSOT
 * questionTypes map.  Always 5 values — "evaluate" and "synthesize" are Bloom
 * level names, not question_type names (evaluate → main_idea, synthesize → sequence).
 */
const CANONICAL_QUESTION_TYPES = new Set([
  "main_idea", "detail", "inference", "vocabulary", "sequence",
]);

/**
 * Normalize any LLM output to one of the 5 canonical question types that the
 * DB accepts.  Handles aliases ("infer" → "inference", "vocab" → "vocabulary",
 * "evaluate" → "main_idea", "synthesize" → "sequence", etc.).
 */
export function coerceQuestionType(raw: unknown): string {
  if (typeof raw !== "string") return "detail";
  const key = raw.trim().toLowerCase().replace(/\s+/g, "_");
  const aliasMap: Record<string, string> = {
    main_idea: "main_idea",
    mainidea: "main_idea",
    detail: "detail",
    details: "detail",
    inference: "inference",
    infer: "inference",
    vocabulary: "vocabulary",
    vocab: "vocabulary",
    sequence: "sequence",
    sequencing: "sequence",
    order: "sequence",
    evaluate: "main_idea",
    evaluation: "main_idea",
    synthesize: "sequence",
    synthesis: "sequence",
  };
  if (aliasMap[key]) return aliasMap[key];
  if (CANONICAL_QUESTION_TYPES.has(key)) return key;
  return "detail";
}

export function gradeHasChapters(grade: number, language: "en" | "zh"): boolean {
  return getChapterCount(grade, language) > 1;
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
  // Chapter & generation config
  chapterCount: number;
  questionsPerChapter: number;
  wordsPerChapter: { min: number; max: number };
  blooms: { literal: number; infer: number; evaluate: number; synthesize: number };
  syntax: { simple: number; compound: number; complex: number };
  vocab: string;
  paragraphSentencesMin: number;
  paragraphSentencesMax: number;
  allowOpinion: boolean;
  themeWords: number;
}

export interface ChineseGradeStandard {
  wordCountRange: { min: number; max: number };
  charCountRange: { min: number; max: number }; // for Chinese char counting
  wpm: number;                          // 字/分钟
  readingMinutes: { min: number; max: number };
  chapterCount: number;
  questionsPerChapter: number;
  wordsPerChapter: { min: number; max: number };
  blooms: { literal: number; infer: number; evaluate: number; synthesize: number };
  syntax: { simple: number; compound: number; complex: number };
  vocab: string;
  paragraphSentencesMin: number;
  paragraphSentencesMax: number;
  allowOpinion: boolean;
  themeWords: number;
}