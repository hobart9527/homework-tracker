// Public barrel for src/lib/reading.
//
// Re-exports the public surface of every reading-pipeline module so callers
// can `import { ... } from "@/lib/reading"` without reaching into internals.
//
// Conventions:
// - Types live in ./types and are the canonical shape. Per-module local
//   interfaces (e.g. content-generator.ts's own GeneratedArticle) are NOT
//   re-exported here to avoid name collisions; consumers should import
//   the canonical types from ./types via this barrel.
// - Each module has its own grouped section below.
// - Append new exports at the end of the relevant section. The W3-T2
//   illustration-generator marker at the bottom is reserved for the next
//   wave to extend without touching unrelated groups.

// ── content-generator (article + questions LLM pipeline) ─────────────────
export { generateArticleContent, generateReadingContent, regenerateQuestionsOnly, buildChinesePrompt, buildEnglishPrompt, resetTokenUsage, getTokenUsage } from "./content-generator";
export type { GenerateArticleOptions, GenerateReadingOptions, LevelVariant } from "./content-generator";
export type { LocalGeneratedIllustration } from "./content-generator";

// ── types (canonical reading types + Supabase row aliases) ───────────────
export type {
  ReadingCategory,
  ReadingQuestionType,
  ReadingAssignmentStatus,
  ReadingArticleStatus,
  ReadingArticle,
  ReadingQuestion,
  ReadingAssignment,
  ReadingQuizAnswer,
  ReadingQuizAttempt,
  ReadingArticleRow,
  ReadingQuestionRow,
  ReadingAssignmentRow,
  ReadingQuizAttemptRow,
  GeneratedArticle,
  GeneratedQuestion,
  ArticleChapter,
  GeneratedIllustration,
} from "./types";

// ── pinyin-converter (ruby-pinyin string builder) ────────────────────────
export { convertToRubyPinyin } from "./pinyin-converter";

// ── quality-gate (post-generation objective checks) ──────────────────────
export { validateContent } from "./quality-gate";
export type {
  QualityGateInput,
  QualityGateIssue,
  QualityGateResult,
  QualityGateSeverity,
} from "./quality-gate";

// ── difficulty (objective difficulty calculator) ─────────────────────────
export { calculateObjectiveDifficulty } from "./difficulty";
export type {
  DifficultyInput,
  DifficultyResult,
  DifficultyIndicators,
} from "./difficulty";

// ── storage-uploader (reading-media bucket helpers) ──────────────────────
export {
  uploadToReadingMedia,
  downloadAndUploadFromUrl,
} from "./storage-uploader";
export type {
  UploadOptions,
  UploadResult,
  DownloadAndUploadOptions,
} from "./storage-uploader";

// ── cover-generator (MiniMax + Pollinations cover pipeline) ──────────────
export { generateCover } from "./cover-generator";
export type { GenerateCoverOptions, CoverResult } from "./cover-generator";

// ── cover-style-presets (category → prompt presets) ──────────────────────
export { COVER_STYLES, buildCoverPrompt } from "./cover-style-presets";
export type { CoverStylePreset } from "./cover-style-presets";

// ── illustration-generator (Pollinations paragraph images) ───────────────
export { generateIllustrations } from "./illustration-generator";
export type {
  GenerateIllustrationsOptions,
  IllustrationResult,
} from "./illustration-generator";

// ── ib-criteria-gate (IB MYP qualitative gate, parallel with quality-gate) ──
export { validateIBCriteria } from "./ib-criteria-gate";
export type {
  IBCriteriaInput,
  IBCriteriaIssue,
  IBCriteriaResult,
  IBCriteriaSeverity,
} from "./ib-criteria-gate";

// ── factual-gate (Tier 1/2 source fidelity gate, skips for Tier 3) ───────────
export { validateFactualAccuracy } from "./factual-gate";
export type {
  FactualGateInput,
  FactualGateIssue,
  FactualGateResult,
  FactualGateSeverity,
} from "./factual-gate";

// ── Wave 3 illustration-generator exports (added by W3-T2) ───────────────
// Marker consumed above — safe to remove on next cleanup pass.
