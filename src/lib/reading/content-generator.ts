import OpenAI from "openai";
import { calculateObjectiveDifficulty } from "./difficulty";
import { getWordCountRange } from "./standards";
import { parseJsonWithRecovery } from "./json-recovery";
import type { GeneratedArticle, GeneratedQuestion } from "./types";

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || "",
      baseURL: process.env.OPENAI_BASE_URL || "https://api.minimaxi.com/v1",
    });
  }
  return _openai;
}

// ---------------------------------------------------------------------------
// Legacy types — kept for backward compatibility with existing callers.
// The canonical types live in ./types.ts and are re-exported from index.ts.
//
// NOTE: This local GeneratedArticle is a narrower subset of the canonical
// GeneratedArticle in ./types.ts (which adds scene_description + IB MYP fields).
// generateReadingContent returns the canonical type from ./types to expose
// all IB MYP fields.
// ---------------------------------------------------------------------------

interface LocalGeneratedArticle {
  title: string;
  content: string;
  summary: string;
  word_count: number;
  estimated_minutes: number;
  difficulty: number; // 1-5
}

interface LocalGeneratedQuestion {
  question_text: string;
  question_type: "main_idea" | "detail" | "inference" | "vocabulary" | "sequence";
  options: { label: string; text: string }[];
  correct_answer: string;
  difficulty: number; // 1-5
  hint?: string;
  explanation?: string;
}

export interface GenerateArticleOptions {
  sourceText: string;
  sourceUrl?: string;
  gradeLevel: number;
  category: string;
  topicKey: string;
}

// ---------------------------------------------------------------------------
// New unified API types
// ---------------------------------------------------------------------------

export type LevelVariant = "L1" | "L2" | "L3";

export interface GenerateReadingOptions {
  topicKey: string;
  language: "zh" | "en"; // never 'zh+en' per Q6 (single-language enforcement)
  category: string;
  // NEW: levelVariant replaces gradeLevel for L1/L2/L3 generation
  levelVariant?: LevelVariant;
  // gradeLevel kept for backward-compat with existing pipeline callers
  gradeLevel?: number; // deprecated: use levelVariant instead
  sourceText?: string; // optional for zh
  // NEW (W0a) — all OPTIONAL for backward-compat:
  recommendedLevels?: string[]; // e.g., ['L4','L5'] — RAZ level codes; upper bound used to derive effective grade
  contentWarnings?: string[]; // e.g., ['war','death','politics'] — triggers age-gate clause when gradeLevel<5
  packId?: string;
  packOrder?: number; // 1-based position within pack
  previousTopicSummary?: string; // narrative continuity hint when packOrder>1
  route?: "A" | "B" | "C";  // routing decision from route-analyzer
  // NEW: IB theme and text type for level-variant generation
  ibTheme?: string; // e.g., "T1"
  textType?: string; // e.g., "fiction"
}

export interface LocalGeneratedIllustration {
  paragraph_index: number;
  scene_description: string;
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

/**
 * Behavior A — derive an effective grade from `recommendedLevels` if present.
 * Parses RAZ level codes (e.g., 'L5' → 5) and returns the upper bound (more
 * challenging side). Falls back to the explicit gradeLevel when the array is
 * empty/undefined or contains no parseable level codes.
 *
 * NEW: When levelVariant is set (L1/L2/L3), maps to a representative grade
 * for backward-compat with gradeLevel-dependent code.
 */
function deriveEffectiveGrade(options: GenerateReadingOptions): number {
  // NEW: levelVariant takes precedence
  if (options.levelVariant) {
    const map: Record<LevelVariant, number> = { L1: 3, L2: 6, L3: 8 };
    return map[options.levelVariant];
  }
  const levels = options.recommendedLevels;
  if (!levels || levels.length === 0) return options.gradeLevel ?? 3;
  const nums = levels
    .map((l) => {
      const m = /^L(\d+)$/i.exec(l.trim());
      return m ? parseInt(m[1], 10) : NaN;
    })
    .filter((n) => Number.isFinite(n));
  if (nums.length === 0) return options.gradeLevel ?? 3;
  return Math.max(...nums);
}

/** Behavior B — age-appropriateness clause (only when raw gradeLevel < 5 AND warnings present). */
function buildAgeGateClauseEn(options: GenerateReadingOptions): string {
  const effectiveGrade = options.levelVariant
    ? ({ L1: 3, L2: 6, L3: 9 } as Record<LevelVariant, number>)[options.levelVariant]
    : (options.gradeLevel ?? 3);
  if (effectiveGrade >= 5) return "";
  const warnings = options.contentWarnings;
  if (!warnings || warnings.length === 0) return "";
  return `\n\nAGE-APPROPRIATENESS: This article must be suitable for a Grade ${effectiveGrade} child. The topic involves [${warnings.join(", ")}]. Use a kid-friendly, calm tone. Do NOT include graphic violence, political controversy, or anything frightening. Focus on factual context and human resilience.`;
}

function buildAgeGateClauseZh(options: GenerateReadingOptions): string {
  const effectiveGrade = options.levelVariant
    ? ({ L1: 3, L2: 6, L3: 9 } as Record<LevelVariant, number>)[options.levelVariant]
    : (options.gradeLevel ?? 3);
  if (effectiveGrade >= 5) return "";
  const warnings = options.contentWarnings;
  if (!warnings || warnings.length === 0) return "";
  return `\n\n适龄性要求：本文须适合${effectiveGrade}年级孩子阅读。题材涉及 [${warnings.join("、")}]。使用儿童友好、平和的语气。禁止血腥暴力描写、政治争议或令人恐惧的内容。聚焦于事实背景和人类的坚韧。`;
}

/** Behavior C — narrative-continuity clause (only when packOrder>1 AND previousTopicSummary present). */
function buildPackContinuityClauseEn(options: GenerateReadingOptions): string {
  if (!options.packOrder || options.packOrder <= 1) return "";
  if (!options.previousTopicSummary) return "";
  return `\n\nNARRATIVE CONTINUITY: This is article ${options.packOrder} in a series. The previous article covered: "${options.previousTopicSummary}". Build on that context naturally without re-explaining basics.`;
}

function buildPackContinuityClauseZh(options: GenerateReadingOptions): string {
  if (!options.packOrder || options.packOrder <= 1) return "";
  if (!options.previousTopicSummary) return "";
  return `\n\n叙事连贯性：这是系列中的第 ${options.packOrder} 篇。上一篇内容为："${options.previousTopicSummary}"。请自然延续语境，不要从头解释基础概念。`;
}

/** Behavior D — single-language lock clause (Q6, ALWAYS injected). */
const LANGUAGE_LOCK_EN =
  "\n\nLANGUAGE LOCK: Produce ONLY English. Do NOT include parallel Chinese translations, glossary entries, or summaries in another language.";
const LANGUAGE_LOCK_ZH =
  "\n\n语言锁定：仅输出中文。请勿夹带英文翻译、术语对照表或其他语言的摘要。注：classical_quote 字段中的 pinyin 和 translation 子字段是允许保留的例外。";

function repairJsonToError(raw: string): string {
  const truncated = raw.slice(0, 300);
  const summary = truncated
    .replace(/\n/g, "\\n")
    .replace(/"/g, '\\"');
  return `JSON修复失败，请检查LLM返回。前300字符: "${summary}"`;
}

function displayTopicKey(opts: GenerateReadingOptions): string {
  if (opts.language === "zh") {
    const stripped = opts.topicKey.replace(/^zh-/, '').replace(/-/g, ' ');
    return `${opts.category}：${stripped}`;
  }
  return opts.topicKey;
}

// ---------------------------------------------------------------------------
// Level-variant prompt builders (L1/L2/L3)
// ---------------------------------------------------------------------------

interface LevelSpec {
  wordCountMin: number;
  wordCountMax: number;
  simplePct: number;
  compoundPct: number;
  complexPct: number;
  vocab: string;
  questionCount: number;
  bloomsLiteral: number;
  bloomsInfer: number;
  bloomsEvaluate: number;
  bloomsSynthesize: number;
  paragraphSentencesMin: number;
  paragraphSentencesMax: number;
  allowOpinion: boolean;
  themeWords: number;
}

const LEVEL_SPECS: Record<LevelVariant, LevelSpec> = {
  L1: {
    wordCountMin: 300, wordCountMax: 400,
    simplePct: 70, compoundPct: 30, complexPct: 0,
    vocab: "GSL 1k-2k only. Use only simple, high-frequency words. Avoid idioms, metaphors, and abstract vocabulary.",
    questionCount: 5,
    bloomsLiteral: 4, bloomsInfer: 1, bloomsEvaluate: 0, bloomsSynthesize: 0,
    paragraphSentencesMin: 3, paragraphSentencesMax: 4,
    allowOpinion: false,
    themeWords: 4,
  },
  L2: {
    wordCountMin: 600, wordCountMax: 800,
    simplePct: 25, compoundPct: 45, complexPct: 30,
    vocab: "GSL 0-3k + AWL 1-5. Introduce some academic vocabulary. Use common idioms and simple metaphors.",
    questionCount: 5,
    bloomsLiteral: 1, bloomsInfer: 2, bloomsEvaluate: 2, bloomsSynthesize: 0,
    paragraphSentencesMin: 4, paragraphSentencesMax: 7,
    allowOpinion: false,
    themeWords: 10,
  },
  L3: {
    wordCountMin: 800, wordCountMax: 1100,
    simplePct: 15, compoundPct: 45, complexPct: 40,
    vocab: "GSL full + AWL full + academic vocabulary. Use sophisticated figurative language, nuanced vocabulary, and rhetorical devices.",
    questionCount: 5,
    bloomsLiteral: 0, bloomsInfer: 2, bloomsEvaluate: 2, bloomsSynthesize: 1,
    paragraphSentencesMin: 5, paragraphSentencesMax: 9,
    allowOpinion: true,
    themeWords: 14,
  },
};

function buildLevelVariantPromptEn(options: GenerateReadingOptions): string {
  const lv = options.levelVariant!;
  const spec = LEVEL_SPECS[lv];
  const ageGateClause = buildAgeGateClauseEn(options);
  const continuityClause = buildPackContinuityClauseEn(options);
  const ibTheme = options.ibTheme ?? "T1";
  const textType = options.textType ?? "fiction";

  return `You are an expert children's reading content creator. You are adapting a source text into a Level ${lv} reading article.

SOURCE TEXT:
${(options.sourceText || "").slice(0, 6000)}

--- LEVEL ${lv} SPECIFICATIONS ---
CRITICAL: The article MUST be between ${spec.wordCountMin} and ${spec.wordCountMax} words. Count every word and verify before outputting.
Sentence structure distribution:
  - Simple sentences: ${spec.simplePct}%
  - Compound sentences: ${spec.compoundPct}%
  - Complex sentences: ${spec.complexPct}%
Vocabulary: ${spec.vocab}
Paragraphs: ${spec.paragraphSentencesMin}-${spec.paragraphSentencesMax} sentences each
${spec.allowOpinion ? "May include opinion, analysis, or argumentation." : "Stay factual and narrative. No opinion or analysis."}

IB THEME: ${ibTheme}
TEXT TYPE: ${textType}
CATEGORY: ${options.category}

--- QUESTIONS (${spec.questionCount} total) ---
CRITICAL: After writing the article, count every word. If word_count is BELOW ${spec.wordCountMin}, add more sentences until it reaches ${spec.wordCountMin}. If word_count is ABOVE ${spec.wordCountMax}, remove sentences until it is under ${spec.wordCountMax}. The final word_count MUST be between ${spec.wordCountMin} and ${spec.wordCountMax}.

CRITICAL: Generate EXACTLY ${spec.questionCount} questions. Each question MUST use the EXACT question_type shown below. Do NOT use any other type.

${[
  spec.bloomsLiteral >= 1 ? `Question #1: question_type MUST be "detail" — ask a specific fact from the text (literal comprehension)` : spec.bloomsInfer >= 1 ? `Question #1: question_type MUST be "inference" — ask what the reader can figure out from clues` : `Question #1: question_type MUST be "main_idea" — ask for judgment or opinion`,
  spec.bloomsLiteral >= 2 ? `Question #2: question_type MUST be "detail" — ask another specific fact (literal comprehension)` : spec.bloomsInfer >= 2 ? `Question #2: question_type MUST be "inference" — ask what a character is likely thinking or feeling` : spec.bloomsEvaluate >= 1 ? `Question #2: question_type MUST be "main_idea" — ask which choice is better and why` : `Question #2: question_type MUST be "inference" — ask what might happen next`,
  spec.bloomsLiteral >= 3 ? `Question #3: question_type MUST be "detail" — ask about a setting or event (literal comprehension)` : spec.bloomsInfer >= 3 ? `Question #3: question_type MUST be "inference" — ask why a character acted a certain way` : spec.bloomsEvaluate >= 2 ? `Question #3: question_type MUST be "main_idea" — ask about the author's purpose or message` : `Question #3: question_type MUST be "vocabulary" — ask what a word means in context`,
  spec.bloomsLiteral >= 4 ? `Question #4: question_type MUST be "detail" — ask about a sequence or order (literal comprehension)` : spec.bloomsInfer >= 4 ? `Question #4: question_type MUST be "inference" — ask what the story implies about a theme` : spec.bloomsEvaluate >= 3 ? `Question #4: question_type MUST be "main_idea" — ask if a character's decision was wise` : spec.bloomsSynthesize >= 1 ? `Question #4: question_type MUST be "sequence" — ask how events connect to form the whole story` : `Question #4: question_type MUST be "main_idea" — ask what the story is mostly about`,
  spec.bloomsLiteral >= 5 ? `Question #5: question_type MUST be "detail" — ask about a character's appearance or action (literal comprehension)` : spec.bloomsInfer >= 5 ? `Question #5: question_type MUST be "inference" — ask what the reader learns about life from the story` : spec.bloomsEvaluate >= 4 ? `Question #5: question_type MUST be "main_idea" — ask how the story could have ended differently` : spec.bloomsSynthesize >= 2 ? `Question #5: question_type MUST be "sequence" — ask how the beginning and ending connect` : `Question #5: question_type MUST be "main_idea" — ask the central message or lesson`
].filter(q => !q.includes(`Question #${spec.questionCount + 1}:`)).join("\n")}

Each question has 4 options (A/B/C/D), exactly one correct answer.
Difficulty scale: 1 (easiest) to 5 (hardest).

--- IB MYP ENGLISH REQUIREMENTS ---
1. GENRE: "narrative" | "informative" | "opinion" | "literary"
2. AUTHOR'S PURPOSE: "to inform" | "to entertain" | "to persuade" | "to explain"
3. Include figurative language appropriate for ${lv}.

--- OUTPUT FORMAT ---
CRITICAL: Your entire response must be ONLY a valid JSON object. Do NOT include any thinking process, explanations, markdown, code fences, or any text before or after the JSON.

Return ONLY this JSON structure:
{
  "title": "Engaging title for Level ${lv}",
  "content": "Full article text...",
  "summary": "One-sentence summary (max 30 words)",
  "word_count": number,
  "estimated_minutes": number,
  "difficulty": number (1-5),
  "scene_description": "A single vivid sentence describing a key scene...",
  "genre": "narrative|informative|opinion|literary",
  "author_purpose": "to inform|to entertain|to persuade|to explain",
  "factual_accuracy": {
    "source_facts_declared": ["fact 1", "fact 2"],
    "facts_preserved_count": 2
  },
  "illustrations": [
    { "paragraph_index": 0, "scene_description": "..." }
  ],
  "questions": [
    {
      "question_text": "...",
      "question_type": "main_idea|detail|inference|vocabulary|sequence",
      "options": [{"label":"A","text":"..."},{"label":"B","text":"..."},{"label":"C","text":"..."},{"label":"D","text":"..."}],
      "correct_answer": "A",
      "difficulty": number (1-5),
      "hint": "Reading strategy tip (1-2 sentences), NOT the answer.",
      "explanation": "Why the correct answer is right, in child-friendly language."
    }
  ]
}

${ageGateClause}${continuityClause}${LANGUAGE_LOCK_EN}`;
}

export function buildEnglishPrompt(options: GenerateReadingOptions): string {
  // NEW: if levelVariant is set, use the level-variant prompt
  if (options.levelVariant) {
    return buildLevelVariantPromptEn(options);
  }

  // Behavior A: effective grade drives wordLimit / questionCount / focusAreas.
  const effectiveGrade = deriveEffectiveGrade(options);
  const enRange = getWordCountRange('en', effectiveGrade);
  const wordLimit = `${enRange.min}-${enRange.max} words`;
  const questionCount = effectiveGrade <= 4 ? 5 : 8;
  const focusAreas = effectiveGrade <= 4
    ? "Detail and vocabulary questions (easier)"
    : "Main idea and inference questions (more analytical)";

  const ageGateClause = buildAgeGateClauseEn(options);
  const continuityClause = buildPackContinuityClauseEn(options);

  return `You are adapting a reading passage for a Grade ${options.gradeLevel ?? 3} student (age ${(options.gradeLevel ?? 3) + 5}).

Original passage:
${(options.sourceText || "").slice(0, 6000)}

Create an adapted version suitable for Grade ${options.gradeLevel ?? 3}. Requirements:
- Target length: ${wordLimit}
- Grade-appropriate vocabulary and sentence complexity
- Clear topic, engaging opening paragraph
- Category: ${options.category}

Also create ${questionCount} comprehension questions (return as array).
Question types to include: ${focusAreas}
Mix of: main_idea, detail, inference, vocabulary, sequence.
Each question has 4 options (A/B/C/D), exactly one correct answer.
Difficulty scale: 1 (easiest) to 5 (hardest).

In addition, provide:
- scene_description: a single vivid sentence describing a key scene from the article (used for cover image generation)
- illustrations: an array of 1-2 objects, each with { paragraph_index, scene_description } for in-article images

--- IB MYP English Requirements ---
1. GENRE: This article MUST be one of the following types. Include the exact type name in the "genre" field:
   - "narrative" = story with characters, setting, plot, conflict, resolution (for: news, history, biography)
   - "informative" = explains facts, processes, or concepts with clear structure (for: science, nature)
   - "opinion" = presents a viewpoint with supporting reasons (for: culture)
   - "literary" = expressive, creative prose with literary devices (for: culture)

2. AUTHOR'S PURPOSE: The "author_purpose" field MUST be one of: "to inform" | "to entertain" | "to persuade" | "to explain"

3. CRITICAL THINKING QUESTIONS: At least 30% of questions MUST be inference (inference type). Do NOT over-rely on detail questions. Include vocabulary and main_idea types as appropriate.

4. FIGURATIVE LANGUAGE: For Grade 4+, include at least one of: metaphor, simile, personification, or idiom in the article content.

GENERATION CHECKLIST (complete before outputting JSON):
□ Genre check: content structure matches declared genre "${options.category}"
  - narrative: all five elements present (time, place, characters, events, significance)
  - informative: definition paragraph + feature/example paragraphs present
□ Critical thinking: inference-type questions ≥ 30% of total (e.g., for 8 questions, ≥3 must be inference)
□ Literary device (G4+): at least one metaphor, simile, personification, or idiom in content
□ classical_quote: original text appears verbatim in content (not paraphrased)
□ Adaptation fidelity (Tier 1/2: when Original passage provided):
  Declare which key facts from source_text are preserved in "factual_accuracy" field,
  format: { "source_facts_declared": ["fact 1", "fact 2", ...], "facts_preserved_count": N }
□ If any item fails, revise content BEFORE filling in JSON fields.

${ageGateClause}${continuityClause}${LANGUAGE_LOCK_EN}

Return STRICT JSON (no markdown, no code fences):
{
  "title": "Article title (engaging for grade ${options.gradeLevel ?? 3})",
  "content": "Full article text...",
  "summary": "One-sentence summary (max 30 words)",
  "word_count": number,
  "estimated_minutes": number,
  "difficulty": number (1-5),
  "scene_description": "A single vivid sentence describing a key scene...",
  "genre": "narrative|informative|opinion|literary",
  "factual_accuracy": {
    "source_facts_declared": ["fact 1", "fact 2"],
    "facts_preserved_count": 2
  },
  "author_purpose": "to inform|to entertain|to persuade|to explain",
  "illustrations": [
    { "paragraph_index": 0, "scene_description": "..." }
  ],
  "questions": [
    {
      "question_text": "...",
      "question_type": "main_idea|detail|inference|vocabulary|sequence",
      "options": [{"label":"A","text":"..."},{"label":"B","text":"..."},{"label":"C","text":"..."},{"label":"D","text":"..."}],
      "correct_answer": "A",
      "difficulty": number (1-5),
      "hint": "A short tip (1-2 sentences) to help the child think about this question. Focus on reading strategy, NOT giving away the answer.",
      "explanation": "Why the correct answer is right, in child-friendly language. Briefly explain which part of the article supports it."
    }
  ]
}`;
}

function buildEnglishRouteAPrompt(options: GenerateReadingOptions): string {
  const effectiveGrade = deriveEffectiveGrade(options);
  const enRange = getWordCountRange("en", effectiveGrade);
  const questionCount = effectiveGrade <= 4 ? 5 : 8;
  const focusAreas = effectiveGrade <= 4
    ? "Detail and vocabulary questions (easier)"
    : "Main idea and inference questions (more analytical)";

  const ageGateClause = buildAgeGateClauseEn(options);
  const continuityClause = buildPackContinuityClauseEn(options);

  return `You are a children's reading assessment expert. You are given a complete article that has already been written. DO NOT rewrite, adapt, or modify the article text in any way.

Original article (USE AS-IS for the "content" field):
${(options.sourceText || "").slice(0, 8000)}

IMPORTANT: Copy the article text EXACTLY into the "content" field of the JSON output. The article is already grade-appropriate.

Create ${questionCount} comprehension questions about this article.
Question types: ${focusAreas}
Mix of: main_idea, detail, inference, vocabulary, sequence.
Each question has 4 options (A/B/C/D), exactly one correct answer.
Difficulty scale: 1 (easiest) to 5 (hardest).

Also provide:
- scene_description: a single vivid sentence describing a key scene from the article
- illustrations: 1-2 objects with { paragraph_index, scene_description }
- summary: one-sentence summary (max 30 words)

--- IB MYP Requirements ---
1. GENRE: one of "narrative" | "informative" | "opinion" | "literary"
2. AUTHOR_PURPOSE: one of "to inform" | "to entertain" | "to persuade" | "to explain"
3. At least 30% of questions MUST be inference type.

${ageGateClause}${continuityClause}${LANGUAGE_LOCK_EN}

Return STRICT JSON (no markdown):
{
  "title": "title",
  "content": "COPY THE ORIGINAL ARTICLE TEXT HERE VERBATIM",
  "summary": "one sentence",
  "word_count": number,
  "estimated_minutes": number,
  "difficulty": number (1-5),
  "scene_description": "key scene description",
  "genre": "narrative|informative|opinion|literary",
  "author_purpose": "to inform|to entertain|to persuade|to explain",
  "illustrations": [{ "paragraph_index": 0, "scene_description": "..." }],
  "questions": [{ "question_text": "...", "question_type": "main_idea|detail|inference|vocabulary|sequence", "options": [{"label":"A","text":"..."},...], "correct_answer": "A", "difficulty": number }]
}`;
}

export function buildChinesePrompt(options: GenerateReadingOptions): string {
  // Behavior A: effective grade drives charLimit / questionCount / focusAreas.
  const effectiveGrade = deriveEffectiveGrade(options);
  const zhRange = getWordCountRange('zh', effectiveGrade);
  const charLimit = `${zhRange.min}-${zhRange.max}`;
  const questionCount = effectiveGrade <= 4 ? 5 : 8;
  const focusAreas = effectiveGrade <= 4
    ? "Detail and vocabulary questions (easier)"
    : "Main idea and inference questions (more analytical)";

  // Trim sourceText to avoid Chinese prompts blowing past ~4000 tokens
  // (1 zh char ≈ 1 token); cap at 4000 chars instead of 6000 for zh.
  const trimmedSource = (options.sourceText || "").slice(0, 4000);
  const sourcePassageBlock = trimmedSource
    ? `\n原文参考：\n${trimmedSource}\n`
    : "";

  const ageGateClause = buildAgeGateClauseZh(options);
  const continuityClause = buildPackContinuityClauseZh(options);

  const effectiveGradeZh = options.levelVariant
    ? ({ L1: 3, L2: 6, L3: 9 } as Record<LevelVariant, number>)[options.levelVariant]
    : (options.gradeLevel ?? 3);

  return `你是一位专业的中文儿童阅读内容创作专家。请为${effectiveGradeZh}年级学生创作一篇阅读文章。

主题：${displayTopicKey(options)}
类别：${options.category}
${sourcePassageBlock}
要求：
- 字数范围：${charLimit}字
- 适合${effectiveGradeZh}年级学生的词汇和句子复杂度
- 主题清晰，开头引人入胜
- 包含一个经典名句（成语、古诗词或名言），并提供原文、拼音和译文

同时创建${questionCount}道阅读理解题。
题型包括：${focusAreas}
混合题型：main_idea（主旨）、detail（细节）、inference（推理）、vocabulary（词汇）、sequence（顺序）。
每道题有4个选项（A/B/C/D），只有一个正确答案。
难度等级：1（最简单）到5（最难）。

此外，请提供：
- scene_description：一句话描述文章中的关键场景（用于封面图生成）
- classical_quote：包含 { original, pinyin, translation } 的对象
- illustrations：1-2个插图对象数组，每个包含 { paragraph_index, scene_description }

--- IB MYP 中文阅读要求 ---
1. 文体（GENDER）：本文必须是以下文体之一，并在 "genre" 字段中填入准确的文体名称：
   - "记叙文" = 有时间/地点/人物/事件/意义五要素的故事
   - "说明文" = 解释事物特征、原理或过程，结构清晰（定义+特征+例子）
   - "议论文" = 提出观点并提供论据支持
   - "文学散文" = 富有文学性，包含比喻、拟人等修辞手法

2. 文化关联（CULTURAL CONNECTION）："cultural_connection" 字段必须填入一句话，说明本文涉及的文化关联点（如传统节日、历史典故、民间故事等）

3. 批判思维题目：至少 30% 的题目为 inference（推理）类型。不要过度依赖 detail（细节）题。可包含 vocabulary、main_idea 等题型。

4. 修辞手法：4年级以上文章，必须在内容中包含至少一种修辞手法：比喻、拟人、排比或成语引用。

自检清单（完成前不得输出 JSON）：
□ 文体自检：本文内容结构与声明的 genre "${options.category}" 一致
  - 记叙文：时间/地点/人物/事件/意义五要素全部存在
  - 说明文：定义段落 + 特征/例子段落全部存在
□ 批判思维：inference 类问题 ≥ 总题数 × 30%（例：8题中≥3题 inference）
□ 修辞手法（4年级以上）：内容中包含至少一种修辞手法（比喻/拟人/排比/成语）
□ 古诗词引用：classical_quote.original 在 content 中逐字出现
□ 文化联结：cultural_connection 描述的内容在文章中实际出现
□ 改编忠实度（Tier 2：当提供了原文参考时）：
  请在 "factual_accuracy" 字段中声明原文中的哪些关键事实在改编版中保留，
  格式：{ "source_facts_declared": ["事实1", "事实2", ...], "facts_preserved_count": N }
□ 如有任何一项不满足，请先修改内容，再填写 JSON 字段。

${ageGateClause}${continuityClause}${LANGUAGE_LOCK_ZH}

返回严格的JSON格式（不要markdown，不要代码块）：
{
  "title": "文章标题",
  "content": "完整文章内容...",
  "summary": "一句话总结（最多30字）",
  "word_count": number,
  "estimated_minutes": number,
  "difficulty": number (1-5),
  "scene_description": "一句话描述关键场景...",
  "genre": "记叙文|说明文|议论文|文学散文",
  "cultural_connection": "一句话描述本文的文化关联点...",
  "classical_quote": {
    "original": "原文",
    "pinyin": "拼音",
    "translation": "译文"
  },
  "factual_accuracy": {
    "source_facts_declared": ["事实1", "事实2"],
    "facts_preserved_count": 2
  },
  "illustrations": [
    { "paragraph_index": 0, "scene_description": "..." }
  ],
  "questions": [
    {
      "question_text": "...",
      "question_type": "main_idea|detail|inference|vocabulary|sequence",
      "options": [{"label":"A","text":"..."},{"label":"B","text":"..."},{"label":"C","text":"..."},{"label":"D","text":"..."}],
      "correct_answer": "A",
      "difficulty": number (1-5),
      "hint": "A short tip (1-2 sentences) to help the child think about this question. Focus on reading strategy, NOT giving away the answer.",
      "explanation": "Why the correct answer is right, in child-friendly language. Briefly explain which part of the article supports it."
    }
  ]
}`;
}

function buildChineseRouteAPrompt(options: GenerateReadingOptions): string {
  const effectiveGrade = deriveEffectiveGrade(options);
  const questionCount = effectiveGrade <= 4 ? 5 : 8;
  const focusAreas = effectiveGrade <= 4
    ? "Detail and vocabulary questions (easier)"
    : "Main idea and inference questions (more analytical)";

  const sourceText = options.sourceText || "";
  const ageGateClause = buildAgeGateClauseZh(options);
  const continuityClause = buildPackContinuityClauseZh(options);

  return `你是一位中文儿童阅读测评专家。你收到了一篇已经写好的完整文章。请勿改写、润色或修改文章正文。

原文（请原封不动地放入 "content" 字段）：
${sourceText.slice(0, 8000)}

重要：将原文逐字复制到 JSON 输出的 "content" 字段中。这篇文章已经适合目标年级学生阅读。

请为这篇文章创建${questionCount}道阅读理解题。
题型包括：${focusAreas}
混合题型：main_idea（主旨）、detail（细节）、inference（推理）、vocabulary（词汇）、sequence（顺序）。
每道题4个选项（A/B/C/D），只有一个正确答案。
难度：1（最简单）到5（最难）。

还需提供：
- scene_description：一句话描述关键场景
- classical_quote：{ original, pinyin, translation }（从原文中找）
- illustrations：1-2个 { paragraph_index, scene_description }
- summary：一句话总结（最多30字）

--- IB MYP 要求 ---
1. genre：记叙文|说明文|议论文|文学散文
2. cultural_connection：一句话文化关联
3. 至少30%题目为inference类型

${ageGateClause}${continuityClause}${LANGUAGE_LOCK_ZH}

返回严格JSON：
{
  "title": "标题",
  "content": "原文逐字复制到这里",
  "summary": "一句话总结",
  "word_count": number,
  "estimated_minutes": number,
  "difficulty": number (1-5),
  "scene_description": "关键场景描述",
  "genre": "记叙文|说明文|议论文|文学散文",
  "cultural_connection": "文化关联描述",
  "classical_quote": { "original": "原文", "pinyin": "拼音", "translation": "译文" },
  "illustrations": [{ "paragraph_index": 0, "scene_description": "..." }],
  "questions": [{ "question_text": "...", "question_type": "...", "options": [...], "correct_answer": "A", "difficulty": number }]
}`;
}

function buildEnglishRouteBPrompt(options: GenerateReadingOptions): string {
  const effectiveGrade = deriveEffectiveGrade(options);
  const enRange = getWordCountRange("en", effectiveGrade);
  const wordLimit = `${enRange.min}-${enRange.max} words`;
  const questionCount = effectiveGrade <= 4 ? 5 : 8;
  const focusAreas = effectiveGrade <= 4
    ? "Detail and vocabulary questions (easier)"
    : "Main idea and inference questions (more analytical)";

  const ageGateClause = buildAgeGateClauseEn(options);
  const continuityClause = buildPackContinuityClauseEn(options);

  const effectiveGradeB = options.levelVariant
    ? ({ L1: 3, L2: 6, L3: 9 } as Record<LevelVariant, number>)[options.levelVariant]
    : (options.gradeLevel ?? 3);

  // B1/B2: retain all facts, only adjust vocabulary and sentence length
  return `You are adapting a reading passage for a Grade ${effectiveGradeB} student. The original text is already mostly suitable — only minor adjustments are needed.

Original text:
${(options.sourceText || "").slice(0, 6000)}

CONSTRAINED ADAPTATION RULES:
1. RETAIN ALL FACTS: Keep every person, event, date, place, and key detail from the original. Do NOT add new facts or remove existing ones.
2. VOCABULARY ONLY: Replace difficult words with grade-appropriate synonyms. Do NOT change meaning.
3. SENTENCE LENGTH: Split sentences longer than 25 words. Combine sentences shorter than 5 words if they're fragments.
4. PARAGRAPH STRUCTURE: Keep the same paragraph order and narrative sequence as the original.
5. DO NOT: add new paragraphs, remove sections, change the story order, or add commentary.

Target length: ${wordLimit}
Question count: ${questionCount}
Question types: ${focusAreas}

Also provide: scene_description, genre, author_purpose, illustrations, and factual_accuracy.

${ageGateClause}${continuityClause}${LANGUAGE_LOCK_EN}

Return STRICT JSON (same format as the standard prompt): {title, content, summary, word_count, estimated_minutes, difficulty, scene_description, genre, author_purpose, factual_accuracy, illustrations, questions}`;
}

function buildChineseRouteBPrompt(options: GenerateReadingOptions): string {
  const effectiveGrade = deriveEffectiveGrade(options);
  const zhRange = getWordCountRange("zh", effectiveGrade);
  const charLimit = `${zhRange.min}-${zhRange.max}`;
  const questionCount = effectiveGrade <= 4 ? 5 : 8;
  const focusAreas = effectiveGrade <= 4
    ? "Detail and vocabulary questions (easier)"
    : "Main idea and inference questions (more analytical)";

  const sourceText = options.sourceText || "";
  const ageGateClause = buildAgeGateClauseZh(options);
  const continuityClause = buildPackContinuityClauseZh(options);

  const effectiveGradeBZh = options.levelVariant
    ? ({ L1: 3, L2: 6, L3: 9 } as Record<LevelVariant, number>)[options.levelVariant]
    : (options.gradeLevel ?? 3);

  return `你是一位专业的中文儿童阅读改编专家。请将以下文言文/古文逐句翻译改编成适合小学${effectiveGradeBZh}年级的白话文。

原文：
${sourceText.slice(0, 4000)}

约束性改编规则（严格遵守）：
1. 逐句翻译：原文的每一句话都要对应1-2句白话文。不要跳过任何句子。
2. 保留全部事实：原文中所有人物、事件、时间、地点必须完整保留。禁止添加原文没有的细节或评论。
3. 词汇替换：生僻字替换为${effectiveGradeBZh}年级课本常用字。专业术语用通俗语言解释。
4. 句子简化：文言文长句拆分为简短白话句。每个白话句子不超过20字。
5. 不要改变叙事顺序：严格按原文段落顺序改写。
6. 保留典故：原文中的成语、典故要保留并稍作解释。

字数范围：${charLimit}字

创建${questionCount}道阅读理解题。题型：${focusAreas}
每道题4个选项（A/B/C/D），只有一个正确答案。

还需提供：scene_description、genre（记叙文/说明文）、cultural_connection、classical_quote、illustrations。

${ageGateClause}${continuityClause}${LANGUAGE_LOCK_ZH}

返回严格JSON格式（同标准格式）：{title, content, summary, word_count, estimated_minutes, difficulty, scene_description, genre, cultural_connection, classical_quote, factual_accuracy, illustrations, questions}`;
}

// ---------------------------------------------------------------------------
// JSON parsing — delegated to json-recovery.ts
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Legacy API — preserved for backward compatibility.
// ---------------------------------------------------------------------------

function buildGenerationPrompt(options: GenerateArticleOptions): string {
  const enRange = getWordCountRange('en', options.gradeLevel);
  const wordLimit = `${enRange.min}-${enRange.max} words`;
  const questionCount = options.gradeLevel <= 4 ? 5 : 8;
  const focusAreas = options.gradeLevel <= 4
    ? "Detail and vocabulary questions (easier)"
    : "Main idea and inference questions (more analytical)";

  return `You are adapting a reading passage for a Grade ${options.gradeLevel} student (age ${options.gradeLevel + 5}).

Original passage:
${options.sourceText.slice(0, 6000)}

Create an adapted version suitable for Grade ${options.gradeLevel}. Requirements:
- Target length: ${wordLimit}
- Grade-appropriate vocabulary and sentence complexity
- Clear topic, engaging opening paragraph
- Category: ${options.category}

Also create ${questionCount} comprehension questions (return as array).
Question types to include: ${focusAreas}
Mix of: main_idea, detail, inference, vocabulary, sequence.
Each question has 4 options (A/B/C/D), exactly one correct answer.
Difficulty scale: 1 (easiest) to 5 (hardest).

Return STRICT JSON (no markdown, no code fences):
{
  "title": "Article title (engaging for grade ${options.gradeLevel})",
  "content": "Full article text...",
  "summary": "One-sentence summary (max 30 words)",
  "word_count": number,
  "estimated_minutes": number,
  "difficulty": number (1-5),
  "questions": [
    {
      "question_text": "...",
      "question_type": "main_idea|detail|inference|vocabulary|sequence",
      "options": [{"label":"A","text":"..."},{"label":"B","text":"..."},{"label":"C","text":"..."},{"label":"D","text":"..."}],
      "correct_answer": "A",
      "difficulty": number (1-5),
      "hint": "A short tip (1-2 sentences) to help the child think about this question. Focus on reading strategy, NOT giving away the answer.",
      "explanation": "Why the correct answer is right, in child-friendly language. Briefly explain which part of the article supports it."
    }
  ]
}`;
}

export async function generateArticleContent(
  options: GenerateArticleOptions
): Promise<{ article: LocalGeneratedArticle; questions: LocalGeneratedQuestion[] }> {
  const prompt = buildGenerationPrompt(options);

  const modelName = process.env.OPENAI_READING_MODEL || "MiniMax-M3";
  const isMiniMax = modelName.toLowerCase().includes("minimax");

  const completion = await getOpenAI().chat.completions.create({
    model: modelName,
    messages: [
      {
        role: "system",
        content:
          "You are an expert children's reading content creator. You adapt articles for specific grade levels and create comprehension questions. Always respond with valid JSON only, no markdown formatting.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
    max_tokens: 8192,
    // Only set JSON response format for non-MiniMax models
    ...(!isMiniMax ? { response_format: { type: "json_object" } } : {}),
    // reasoning_split=true separates native CoT into reasoning_details field,
    // keeping content clean JSON. MiniMax models always think internally;
    // this just routes the thinking out of the content field.
    // @ts-expect-error OpenAI SDK types don't include MiniMax-specific params
    reasoning_split: true,
  });

  const rawText = completion.choices[0]?.message?.content || "{}";
  const result = parseJsonWithRecovery(rawText) as Record<string, any>;

  return {
    article: {
      title: result.title || "Untitled",
      content: result.content || "",
      summary: result.summary || "",
      word_count: result.word_count || 0,
      estimated_minutes: result.estimated_minutes || 5,
      difficulty: result.difficulty || 3,
    } satisfies LocalGeneratedArticle,
    questions: Array.isArray(result.questions)
      ? (result.questions as Record<string, unknown>[]).map((q) => ({
          question_text: (q.question_text as string) || "",
          question_type: (q.question_type as LocalGeneratedQuestion["question_type"]) || "detail",
          options: (q.options as { label: string; text: string }[]) || [],
          correct_answer: (q.correct_answer as string) || "A",
          difficulty: (q.difficulty as number) || 3,
        }))
      : [],
  };
}

// ---------------------------------------------------------------------------
// New unified API
// ---------------------------------------------------------------------------

export async function generateReadingContent(
  opts: GenerateReadingOptions
): Promise<{
  article: GeneratedArticle;
  questions: GeneratedQuestion[];
  illustrations: LocalGeneratedIllustration[];
}> {
  const prompt = (() => {
    if (opts.route === "A") {
      return opts.language === "zh" ? buildChineseRouteAPrompt(opts) : buildEnglishRouteAPrompt(opts);
    }
    if (opts.route === "B") {
      return opts.language === "zh" ? buildChineseRouteBPrompt(opts) : buildEnglishRouteBPrompt(opts);
    }
    // Route C (default): existing full-generation prompts
    return opts.language === "zh" ? buildChinesePrompt(opts) : buildEnglishPrompt(opts);
  })();

  const modelName = process.env.OPENAI_READING_MODEL || "MiniMax-M3";
  const isMiniMax = modelName.toLowerCase().includes("minimax");

  const completion = await getOpenAI().chat.completions.create({
    model: modelName,
    messages: [
      {
        role: "system",
        content:
          "You are an expert children's reading content creator. You create reading articles and comprehension questions for students. CRITICAL: Your entire response must be a single valid JSON object. Do NOT write the article as plain text outside the JSON. Put the full article text inside the JSON 'content' field. Do NOT include markdown code fences, <thinking> tags, or any text outside the JSON object.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
    max_tokens: (() => {
      if (opts.route === "A") return 8192;    // questions+metadata only
      if (opts.route === "B") return 16384;   // constrained rewrite
      // Route C: full generation. MiniMax-M3 supports 1M context, so generous
      // budget prevents JSON truncation even with reasoning content.
      return opts.language === "zh" ? 65536 : 32768;
    })(),
    // Only set JSON response format for non-MiniMax models
    ...(!isMiniMax ? { response_format: { type: "json_object" } } : {}),
    // reasoning_split=true routes internal CoT to reasoning_details,
    // so content stays clean JSON. MiniMax always thinks internally.
    // @ts-expect-error OpenAI SDK types don't include MiniMax-specific params
    reasoning_split: true,
  });

  const rawText = completion.choices?.[0]?.message?.content || "{}";
  let result: Record<string, unknown>;
  try {
    result = parseJsonWithRecovery(rawText) as Record<string, unknown>;
  } catch {
    throw new Error(repairJsonToError(rawText));
  }

  // Override LLM-returned difficulty with objective calculation
  const content = result.content as string | undefined;
  const effectiveGradeForDifficulty = opts.levelVariant
    ? ({ L1: 3, L2: 6, L3: 9 } as Record<LevelVariant, number>)[opts.levelVariant]
    : (opts.gradeLevel ?? 3);
  const objResult = calculateObjectiveDifficulty({
    content: content || "",
    language: opts.language,
    gradeLevel: effectiveGradeForDifficulty,
    llmDifficulty: result.difficulty as number | undefined,
  });

  return {
    article: {
      title: (result.title as string) || "Untitled",
      content: content || "",
      summary: (result.summary as string) || "",
      word_count: (result.word_count as number) || 0,
      estimated_minutes: (result.estimated_minutes as number) || 5,
      difficulty: objResult.difficulty, // override LLM value with objective score
      scene_description: (result.scene_description as string) || "",
      // IB MYP fields — populate from LLM result or fall back to safe defaults
      genre: (result.genre as GeneratedArticle["genre"]) || (opts.language === "zh" ? "记叙文" : "informative"),
      author_purpose: (result.author_purpose as GeneratedArticle["author_purpose"]) || "to inform",
      cultural_connection: result.cultural_connection as string | undefined,
      classical_quote: result.classical_quote as { original: string; pinyin: string; translation: string } | undefined,
      // Factual accuracy fallback — when no sourceText provided or LLM omits field
      factual_accuracy: result.factual_accuracy as { source_facts_declared: string[]; facts_preserved_count: number } | undefined,
    } satisfies GeneratedArticle,
    questions: Array.isArray(result.questions)
      ? (result.questions as Record<string, unknown>[]).map((q) => ({
          question_text: (q.question_text as string) || "",
          question_type: (q.question_type as GeneratedQuestion["question_type"]) || "detail",
          options: (q.options as { label: string; text: string }[]) || [],
          correct_answer: (q.correct_answer as string) || "A",
          difficulty: (q.difficulty as number) || 3,
        }))
      : [],
    illustrations: Array.isArray(result.illustrations)
      ? (result.illustrations as Record<string, unknown>[]).map((ill) => ({
          paragraph_index: (ill.paragraph_index as number) || 0,
          scene_description: (ill.scene_description as string) || "",
        } satisfies LocalGeneratedIllustration))
      : [],
  };
}