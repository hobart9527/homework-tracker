import OpenAI from "openai";
import { calculateObjectiveDifficulty } from "./difficulty";
import { getWordCountRange, getTotalQuestionCount, getChapterCount, getQuestionsPerChapter, getBloomDistribution, getSyntaxDistribution, getVocabScope, getWordsPerChapter, gradeHasChapters, getEnglishStandard, getChineseStandard } from "./standards";
import { parseJsonWithRecovery } from "./json-recovery";
import type { GeneratedArticle, GeneratedQuestion, ArticleChapter } from "./types";

let _openai: OpenAI | null = null;
/** True when using MiniMax API directly (no proxy). */
function isDirectMiniMax(): boolean {
  return !!process.env.MINIMAX_API_KEY;
}
function getOpenAI(): OpenAI {
  if (!_openai) {
    const miniMaxKey = process.env.MINIMAX_API_KEY;
    _openai = new OpenAI({
      apiKey: miniMaxKey || process.env.OPENAI_API_KEY || "",
      baseURL: miniMaxKey ? "https://api.minimaxi.com/v1" : (process.env.OPENAI_BASE_URL || "https://api.minimaxi.com/v1"),
    });
  }
  return _openai;
}
/** Return correct model name: MiniMax native model when direct, proxy alias when via 9router. */
function getModel(): string {
  if (isDirectMiniMax()) return "MiniMax-M2.7";
  return process.env.OPENAI_READING_MODEL || "MiniMax-M2.7";
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
  language: "zh" | "en";
  category: string;
  // schoolGrade is the primary driver — maps directly to reading-standards.json
  schoolGrade?: number;
  // levelVariant for L1/L2/L3 backward compat (maps to L1→3, L2→6, L3→8)
  levelVariant?: LevelVariant;
  gradeLevel?: number; // deprecated
  sourceText?: string;
  recommendedLevels?: string[];
  contentWarnings?: string[];
  packId?: string;
  packOrder?: number;
  previousTopicSummary?: string;
  route?: "A" | "B" | "C";
  ibTheme?: string;
  textType?: string;
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
  // schoolGrade takes highest precedence
  if (options.schoolGrade !== undefined && options.schoolGrade > 0) {
    return options.schoolGrade;
  }
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
// Grade-driven prompt builders — reads from reading-standards.json
// ---------------------------------------------------------------------------

function buildGradePromptEn(options: GenerateReadingOptions, grade: number): string {
  const ageGateClause = buildAgeGateClauseEn(options);
  const continuityClause = buildPackContinuityClauseEn(options);
  const ibTheme = options.ibTheme ?? "T1";
  const textType = options.textType ?? "fiction";
  const lang = options.language || "en";

  const enStd = getEnglishStandard(grade);
  const std = {
    wordCountMin: getWordCountRange(lang, grade).min,
    wordCountMax: getWordCountRange(lang, grade).max,
    questionCount: getTotalQuestionCount(grade, lang),
    ...getBloomDistribution(grade, lang),
    ...getSyntaxDistribution(grade, lang),
    allowOpinion: enStd.allowOpinion,
    paragraphSentencesMin: enStd.paragraphSentencesMin,
    paragraphSentencesMax: enStd.paragraphSentencesMax,
    vocab: enStd.vocab,
    themeWords: enStd.themeWords,
  };

  const bloomsBloom = getBloomDistribution(grade, lang);
  const qSpec: Array<{ literal: number; infer: number; evaluate: number; synthesize: number }> = [];
  // Build sequential question spec
  for (let i = 0; i < std.questionCount; i++) {
    // Distribute bloom's evenly across questions
    const pos = i % 4;
    qSpec.push({
      literal: pos === 0 ? 1 : 0,
      infer: pos === 1 ? 1 : 0,
      evaluate: pos === 2 ? 1 : 0,
      synthesize: pos === 3 ? 1 : 0,
    });
  }

  function qTypeForIndex(idx: number): string {
    const b = qSpec[idx] || qSpec[0];
    if (b.literal && bloomsBloom.literal > 0) return `"detail"`;
    if (b.infer && bloomsBloom.infer > 0) return `"inference"`;
    if (b.evaluate && bloomsBloom.evaluate > 0) return `"main_idea"`;
    if (b.synthesize && bloomsBloom.synthesize > 0) return `"sequence"`;
    return `"detail"`;
  }

  const questionLines = Array.from({ length: std.questionCount }, (_, i) => {
    const qt = qTypeForIndex(i);
    const prefix = `Question #${i + 1}: question_type MUST be ${qt}`;
    if (qt === `"detail"`) return `${prefix} — ask a specific fact from the text (literal comprehension)`;
    if (qt === `"inference"`) return `${prefix} — ask what the reader can figure out from clues`;
    if (qt === `"main_idea"`) return `${prefix} — ask for judgment or opinion`;
    return `${prefix} — ask how events connect or build on each other`;
  }).join("\n");

  return `You are an expert children's reading content creator. You are adapting a source text for Grade ${grade} students.

SOURCE TEXT:
${(options.sourceText || "").slice(0, 6000)}

--- GRADE ${grade} SPECIFICATIONS ---
CRITICAL: The article MUST be between ${std.wordCountMin} and ${std.wordCountMax} words.
Sentence structure distribution:
  - Simple sentences: ${std.simple}%
  - Compound sentences: ${std.compound}%
  - Complex sentences: ${std.complex}%
Vocabulary: ${std.vocab}
Paragraphs: ${std.paragraphSentencesMin}-${std.paragraphSentencesMax} sentences each
${std.allowOpinion ? "May include opinion, analysis, or argumentation." : "Stay factual and narrative. No opinion or analysis."}

IB THEME: ${ibTheme}
TEXT TYPE: ${textType}
CATEGORY: ${options.category}

--- QUESTIONS (${std.questionCount} total) ---
CRITICAL: Generate EXACTLY ${std.questionCount} questions.
${questionLines}

Each question has 4 options (A/B/C/D), exactly one correct answer.
Difficulty scale: 1 (easiest) to 5 (hardest).

--- IB MYP ENGLISH REQUIREMENTS ---
1. GENRE: "narrative" | "informative" | "opinion" | "literary"
2. AUTHOR'S PURPOSE: "to inform" | "to entertain" | "to persuade" | "to explain"
3. Include figurative language appropriate for Grade ${grade}.

--- OUTPUT FORMAT ---
CRITICAL: Your entire response must be ONLY a valid JSON object. Do NOT include any thinking process, explanations, markdown, code fences, or any text before or after the JSON.

Return ONLY this JSON structure:
{
  "title": "Engaging title for Grade ${grade}",
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
  const grade = deriveEffectiveGrade(options);
  return buildGradePromptEn(options, grade);
}

// ---------------------------------------------------------------------------
// Chinese grade-driven prompt — mirrors buildGradePromptEn
// ---------------------------------------------------------------------------

function buildGradePromptZh(options: GenerateReadingOptions, grade: number): string {
  const ageGateClause = buildAgeGateClauseZh(options);
  const continuityClause = buildPackContinuityClauseZh(options);
  const lang = "zh";
  const ibTheme = options.ibTheme ?? "T1";
  const textType = options.textType ?? "fiction";

  const zhStd = getChineseStandard(grade);
  const std = {
    charCountMin: getWordCountRange(lang, grade).min,
    charCountMax: getWordCountRange(lang, grade).max,
    questionCount: getTotalQuestionCount(grade, lang),
    ...getBloomDistribution(grade, lang),
    ...getSyntaxDistribution(grade, lang),
    vocab: zhStd.vocab,
    paragraphSentencesMin: zhStd.paragraphSentencesMin,
    paragraphSentencesMax: zhStd.paragraphSentencesMax,
    allowOpinion: zhStd.allowOpinion,
    themeWords: zhStd.themeWords,
  };

  const bloomsBloom = getBloomDistribution(grade, lang);
  const qSpec: Array<{ literal: number; infer: number; evaluate: number; synthesize: number }> = [];
  for (let i = 0; i < std.questionCount; i++) {
    const pos = i % 4;
    qSpec.push({
      literal: pos === 0 ? 1 : 0,
      infer: pos === 1 ? 1 : 0,
      evaluate: pos === 2 ? 1 : 0,
      synthesize: pos === 3 ? 1 : 0,
    });
  }

  function qTypeForGradeZh(idx: number): string {
    const b = qSpec[idx] || qSpec[0];
    if (b.literal && bloomsBloom.literal > 0) return `"detail"`;
    if (b.infer && bloomsBloom.infer > 0) return `"inference"`;
    if (b.evaluate && bloomsBloom.evaluate > 0) return `"main_idea"`;
    if (b.synthesize && bloomsBloom.synthesize > 0) return `"sequence"`;
    return `"detail"`;
  }

  const questionLines = Array.from({ length: std.questionCount }, (_, i) => {
    const qt = qTypeForGradeZh(i);
    const prefix = `题目 #${i + 1}：question_type 必须为 ${qt}`;
    if (qt === `"detail"`) return `${prefix} — 考察文中具体事实（字面理解）`;
    if (qt === `"inference"`) return `${prefix} — 考察从线索推断的能力`;
    if (qt === `"main_idea"`) return `${prefix} — 考察判断或观点`;
    return `${prefix} — 考察事件关联或承接关系`;
  }).join("\n");

  return `你是一位专业的中文儿童阅读内容创作专家。你正为${grade}年级学生创作阅读文章。

主题：${displayTopicKey(options)}
类别：${options.category}
${options.sourceText ? `原文参考：\n${(options.sourceText || "").slice(0, 4000)}\n` : ""}

--- ${grade}年级规格 ---
核心要求：文章字数在 ${std.charCountMin} 到 ${std.charCountMax} 字之间。
句子结构分布：
  - 简单句：${std.simple}%
  - 并列句：${std.compound}%
  - 复合句：${std.complex}%
词汇范围：${std.vocab}
段落：每段 ${std.paragraphSentencesMin}-${std.paragraphSentencesMax} 句
${std.allowOpinion ? "可包含观点、分析或议论。" : "保持客观叙述。不要夹带个人观点或分析。"}

IB 主题：${ibTheme}
文体：${textType}

--- 题目（共${std.questionCount}道）---
核心要求：生成恰好 ${std.questionCount} 道阅读理解题。
${questionLines}

每道题 4 个选项（A/B/C/D），仅一个正确答案。
难度等级：1（最简单）到 5（最难）。

--- IB MYP 中文阅读要求 ---
1. 文体（genre）："记叙文" | "说明文" | "议论文" | "文学散文"
2. 文化关联（cultural_connection）：一句话说明本文涉及的文化关联点
3. ${grade >= 4 ? "至少使用一种修辞手法：比喻、拟人、排比或成语引用" : ""}
4. 包含 classical_quote（成语/古诗词/名言），含原文、拼音和译文

--- 输出格式 ---
核心要求：只返回 JSON。不要包含思考过程、markdown、代码块或额外文字。

返回严格 JSON 结构：
{
  "title": "适合${grade}年级的标题",
  "content": "完整文章内容...",
  "summary": "一句话总结（最多30字）",
  "word_count": number,
  "estimated_minutes": number,
  "difficulty": number (1-5),
  "scene_description": "一句话关键场景描述...",
  "genre": "记叙文|说明文|议论文|文学散文",
  "cultural_connection": "文化关联点一句话描述",
  "classical_quote": { "original": "原文", "pinyin": "拼音", "translation": "译文" },
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
      "hint": "答题策略提示（1-2句），不要直接给答案。",
      "explanation": "为什么正确答案是对的，用儿童友好语言解释。"
    }
  ]
}

${ageGateClause}${continuityClause}${LANGUAGE_LOCK_ZH}`;
}

// Route A prompt: article content is passed as-is (no LLM rewrite).
// LLM only generates questions + metadata (summary, scene_description, genre).
// Content/word_count/difficulty/estimated_minutes are computed by caller.
const ROUTE_A_PROMPT_EN =
`You are a children's reading assessment expert. Given a complete article, create comprehension questions and metadata. DO NOT output the article content.

Article:
{{SOURCE_TEXT}}

Create {{QUESTION_COUNT}} comprehension questions.
Question types: {{FOCUS_AREAS}}
Mix of: main_idea, detail, inference, vocabulary, sequence.
Each question MUST have EXACTLY 4 options labeled "A", "B", "C", "D" with non-empty text.
Exactly one correct answer. Difficulty scale: 1 (easiest) to 5 (hardest).

Also provide:
- scene_description: one vivid sentence describing a key scene
- summary: one-sentence summary (max 30 words)
- genre: "narrative"|"informative"|"opinion"|"literary"
- author_purpose: "to inform"|"to entertain"|"to persuade"|"to explain"
- illustrations: 1-2 objects with { paragraph_index, scene_description }

At least 30% of questions MUST be inference type.

Question type distribution:
{{QUESTION_DISTRIBUTION}}

Return STRICT JSON:
{
  "summary": "one sentence",
  "scene_description": "key scene description",
  "genre": "narrative|informative|opinion|literary",
  "author_purpose": "to inform|to entertain|to persuade|to explain",
  "illustrations": [{ "paragraph_index": 0, "scene_description": "..." }],
  "questions": [
    {
      "question_text": "What is the main idea of the passage?",
      "question_type": "main_idea",
      "options": [
        {"label":"A","text":"First option text here"},
        {"label":"B","text":"Second option text here"},
        {"label":"C","text":"Third option text here"},
        {"label":"D","text":"Fourth option text here"}
      ],
      "correct_answer": "A",
      "difficulty": 3
    }
  ]
}`;

const ROUTE_A_PROMPT_ZH =
`你是一位中文儿童阅读测评专家。请根据给定的完整文章，创建阅读题和元数据。请勿输出文章正文。

文章：
{{SOURCE_TEXT}}

创建{{QUESTION_COUNT}}道阅读理解题。
题型：{{FOCUS_AREAS}}
混合题型：main_idea（主旨）、detail（细节）、inference（推理）、vocabulary（词汇）、sequence（顺序）。
每道题必须有且仅有4个选项，标记为"A"、"B"、"C"、"D"，每个选项必须有文字内容。
只有一个正确答案。难度：1（最简单）到5（最难）。

还需提供：
- scene_description：一句话描述关键场景
- summary：一句话总结（最多30字）
- genre：记叙文|说明文|议论文|文学散文
- cultural_connection：一句话文化关联
- classical_quote：{ original, pinyin, translation }

题型分布标注在下方各题具体说明中，请严格按每道题指定的 question_type 执行。

返回严格JSON（每个选项必须包含 label 和 text 字段）：
{
  "summary": "一句话总结",
  "scene_description": "关键场景描述",
  "genre": "记叙文|说明文|议论文|文学散文",
  "cultural_connection": "文化关联描述",
  "classical_quote": { "original": "原文", "pinyin": "拼音", "translation": "译文" },
  "illustrations": [{ "paragraph_index": 0, "scene_description": "..." }],
  "questions": [
    {
      "question_text": "这篇文章的主要内容是什么？",
      "question_type": "main_idea",
      "options": [
        {"label":"A","text":"第一个选项"},
        {"label":"B","text":"第二个选项"},
        {"label":"C","text":"第三个选项"},
        {"label":"D","text":"第四个选项"}
      ],
      "correct_answer": "A",
      "difficulty": 3
    }
  ]
}`;

function buildEnglishRouteAPrompt(options: GenerateReadingOptions): string {
  const effectiveGrade = deriveEffectiveGrade(options);
  const lang = "en";
  const questionCount = effectiveGrade <= 4 ? 5 : 8;
  const focusAreas = effectiveGrade <= 4
    ? "Detail and vocabulary questions (easier)"
    : "Main idea and inference questions (more analytical)";
  const bloomDist = getBloomDistribution(effectiveGrade, lang);

  const ageGateClause = buildAgeGateClauseEn(options);
  const continuityClause = buildPackContinuityClauseEn(options);

  // Build question type distribution from SSOT bloom's
  const blooms = [bloomDist.literal, bloomDist.infer, bloomDist.evaluate, bloomDist.synthesize];
  const typeNames = ["detail", "inference", "main_idea", "sequence"];
  const qTypes: string[] = [];
  for (let i = 0; i < questionCount; i++) {
    const pos = i % 4;
    qTypes.push(blooms[pos] > 0 ? typeNames[pos] : "detail");
  }
  const distribution = qTypes.map((t, i) =>
    `  Q${i + 1}: question_type="${t}"`
  ).join("\n");

  return ROUTE_A_PROMPT_EN
    .replace("{{SOURCE_TEXT}}", (options.sourceText || "").slice(0, 8000))
    .replace("{{QUESTION_COUNT}}", String(questionCount))
    .replace("{{FOCUS_AREAS}}", focusAreas)
    .replace("{{QUESTION_DISTRIBUTION}}", distribution)
    + ageGateClause + continuityClause + LANGUAGE_LOCK_EN;
}

function buildChineseRouteAPrompt(options: GenerateReadingOptions): string {
  const effectiveGrade = deriveEffectiveGrade(options);
  const lang = "zh";
  const questionCount = getTotalQuestionCount(effectiveGrade, lang);
  const bloomDist = getBloomDistribution(effectiveGrade, lang);
  const focusAreas = effectiveGrade <= 4
    ? "Detail and vocabulary questions (easier)"
    : "Main idea and inference questions (more analytical)";

  const sourceText = options.sourceText || "";
  const ageGateClause = buildAgeGateClauseZh(options);
  const continuityClause = buildPackContinuityClauseZh(options);

  // Build question type distribution from SSOT bloom's
  const qTypes: string[] = [];
  const blooms = [bloomDist.literal, bloomDist.infer, bloomDist.evaluate, bloomDist.synthesize];
  const typeNames = ["detail", "inference", "main_idea", "sequence"];
  for (let i = 0; i < questionCount; i++) {
    const pos = i % 4;
    qTypes.push(blooms[pos] > 0 ? typeNames[pos] : "detail");
  }
  const typeExamples = qTypes.map((t, i) =>
    `题${i + 1}: question_type="${t}"`
  ).join("\n");

  return ROUTE_A_PROMPT_ZH
    .replace("{{SOURCE_TEXT}}", sourceText.slice(0, 4000))
    .replace("{{QUESTION_COUNT}}", String(questionCount))
    .replace("{{FOCUS_AREAS}}", focusAreas)
    + `\n\n题型分布（基于${effectiveGrade}年级标准）:\n${typeExamples}\n`
    + ageGateClause + continuityClause + LANGUAGE_LOCK_ZH;
}

export function buildChinesePrompt(options: GenerateReadingOptions): string {
  const grade = deriveEffectiveGrade(options);
  return buildGradePromptZh(options, grade);
}

function buildEnglishRouteBPrompt(options: GenerateReadingOptions): string {
  const effectiveGrade = deriveEffectiveGrade(options);
  const lang = options.language || "en";
  const enRange = getWordCountRange("en", effectiveGrade);
  const wordLimit = `${enRange.min}-${enRange.max} words`;
  const questionCount = getTotalQuestionCount(effectiveGrade, lang);

  const ageGateClause = buildAgeGateClauseEn(options);
  const continuityClause = buildPackContinuityClauseEn(options);

  // B1/B2: retain all facts, only adjust vocabulary and sentence length
  return `You are adapting a reading passage for a Grade ${effectiveGrade} student. The original text is already mostly suitable — only minor adjustments are needed.

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
Question types: main_idea, detail, inference, vocabulary, sequence

Also provide: scene_description, genre, author_purpose, illustrations, and factual_accuracy.

${ageGateClause}${continuityClause}${LANGUAGE_LOCK_EN}

Return STRICT JSON (same format as the standard prompt): {title, content, summary, word_count, estimated_minutes, difficulty, scene_description, genre, author_purpose, factual_accuracy, illustrations, questions}`;
}

function buildChineseRouteBPrompt(options: GenerateReadingOptions): string {
  const effectiveGrade = deriveEffectiveGrade(options);
  const lang = "zh";
  const zhRange = getWordCountRange("zh", effectiveGrade);
  const charLimit = `${zhRange.min}-${zhRange.max}`;
  const questionCount = getTotalQuestionCount(effectiveGrade, lang);
  const syntaxDist = getSyntaxDistribution(effectiveGrade, lang);
  const vocab = getVocabScope(effectiveGrade, lang);
  const bloomDist = getBloomDistribution(effectiveGrade, lang);

  const sourceText = options.sourceText || "";
  const ageGateClause = buildAgeGateClauseZh(options);
  const continuityClause = buildPackContinuityClauseZh(options);

  return `你是一位专业的中文儿童阅读改编专家。请将以下文言文/古文逐句翻译改编成适合${effectiveGrade}年级的白话文。

原文：
${sourceText.slice(0, 4000)}

约束性改编规则（严格遵守）：
1. 逐句翻译：原文的每一句话都要对应1-2句白话文。不要跳过任何句子。
2. 保留全部事实：原文中所有人物、事件、时间、地点必须完整保留。禁止添加原文没有的细节或评论。
3. 词汇替换：生僻字替换为${effectiveGrade}年级课本常用字（${vocab}）。专业术语用通俗语言解释。
4. 句子简化：文言文长句拆分为简短白话句。每个白话句子不超过20字。
5. 不要改变叙事顺序：严格按原文段落顺序改写。
6. 保留典故：原文中的成语、典故要保留并稍作解释。

字数范围：${charLimit}字
句子结构：简单句${syntaxDist.simple}%、并列句${syntaxDist.compound}%、复合句${syntaxDist.complex}%

创建${questionCount}道阅读理解题。
题型分布：detail ${bloomDist.literal}%、inference ${bloomDist.infer}%、main_idea ${bloomDist.evaluate}%、sequence ${bloomDist.synthesize}%
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

  const modelName = getModel();
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

function normalizeQuestionOptions(q: Record<string, unknown>): { label: string; text: string }[] {
  const raw = q.options;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((o): o is Record<string, unknown> => o !== null && typeof o === "object")
    .map((o) => ({
      label: String(o.label || "").trim(),
      text: String(o.text || "").trim(),
    }))
    .filter((o) => o.label || o.text);
}

function normalizeQuestions(result: Record<string, unknown>): GeneratedQuestion[] {
  const raw = result.questions;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((q): q is Record<string, unknown> => q !== null && typeof q === "object")
    .filter((q) => {
      const opts = q.options;
      return Array.isArray(opts) && opts.length >= 4;
    })
    .map((q) => {
      const options = normalizeQuestionOptions(q);
      return {
        question_text: String(q.question_text || "").trim(),
        question_type: (q.question_type as GeneratedQuestion["question_type"]) || "detail",
        options,
        correct_answer: String(q.correct_answer || "").trim() || "A",
        difficulty: Number(q.difficulty) || 3,
      };
    });
}

function normalizeIllustrations(result: Record<string, unknown>): LocalGeneratedIllustration[] {
  const raw = result.illustrations;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((ill): ill is Record<string, unknown> => ill !== null && typeof ill === "object")
    .map((ill) => ({
      paragraph_index: Number(ill.paragraph_index) || 0,
      scene_description: String(ill.scene_description || "").trim(),
    }));
}

function validateRequiredFields(result: Record<string, unknown>): void {
  const missing: string[] = [];
  if (!result.title) missing.push("title");
  if (!result.content) missing.push("content");
  if (!Array.isArray(result.questions)) missing.push("questions");
  if (missing.length > 0) {
    throw new Error(`Content generation failed: missing required fields after JSON recovery: ${missing.join(", ")}`);
  }
}

// ---------------------------------------------------------------------------
// Chapterized content generation (Grade >= 4)
// ---------------------------------------------------------------------------

/**
 * Phase 1: Generate chapter outlines (headings + summaries).
 * Small prompt, low max_tokens — impossible to truncate.
 */
async function generateChapterOutline(
  grade: number,
  chapterCount: number,
  opts: GenerateReadingOptions
): Promise<{ title: string; chapters: ArticleChapter[] }> {
  const lang = opts.language || "en";
  const isEn = lang === "en";
  const isRouteB = opts.route === "B" && !!opts.sourceText;
  const sourceSegment = opts.sourceText ? opts.sourceText.slice(0, 3000) : "";
  const sourceGuidance = isRouteB
    ? `\nIMPORTANT — Route B (rewrite): Base each chapter ON THE SOURCE TEXT structure. Split the source across ${chapterCount} logical chapters, rewriting for Grade ${grade} reading level. Preserve all key facts.`
    : "";

  const outlinePrompt = isEn
    ? `Create a ${chapterCount}-chapter outline for a Grade ${grade} reading article.

Topic: ${opts.topicKey}
Category: ${opts.category}
${sourceSegment ? `Source text:\n${sourceSegment}` : ""}${sourceGuidance}

Return ONLY a JSON object:
{
  "title": "Engaging article title for Grade ${grade}",
  "chapters": [
    { "heading": "Chapter title", "summary": "What this chapter covers (1-2 sentences)" },
    ...
  ]
}

Exactly ${chapterCount} chapters.`
    : `为一个${grade}年级的阅读文章创建一个${chapterCount}章的提纲。

主题：${displayTopicKey(opts)}
类别：${opts.category}
${sourceSegment ? `原文参考：\n${sourceSegment.slice(0, 2000)}` : ""}${sourceGuidance}

返回严格JSON对象：
{
  "title": "为${grade}年级设计的文章标题",
  "chapters": [
    { "heading": "章节标题", "summary": "章节内容概述（1-2句话）" },
    ...
  ]
}

共${chapterCount}章。`;

  const modelName = getModel();
  const isMiniMax = modelName.toLowerCase().includes("minimax");

  const completion = await getOpenAI().chat.completions.create({
    model: modelName,
    messages: [
      { role: "system", content: "You create structured outlines. Return only valid JSON." },
      { role: "user", content: outlinePrompt },
    ],
    temperature: 0.7,
    max_tokens: 2048,
    ...(!isMiniMax ? { response_format: { type: "json_object" } } : {}),
    reasoning_split: true,
  } as any);

  const rawText = completion.choices?.[0]?.message?.content || "{}";
  let articleTitle: string;
  let outlines: Array<{ heading?: string; summary?: string }>;
  try {
    const parsed = parseJsonWithRecovery(rawText) as Record<string, unknown>;
    const chapters = (Array.isArray(parsed) ? parsed : (parsed.chapters || parsed.outline || [])) as Array<{ heading?: string; summary?: string }>;
    outlines = Array.isArray(chapters) ? chapters : [];
    articleTitle = typeof parsed.title === "string" ? parsed.title : "";
  } catch {
    outlines = [];
    articleTitle = "";
  }

  if (outlines.length === 0) {
    // Fallback: generate generic chapter headings
    outlines = Array.from({ length: chapterCount }, (_, i) => ({
      heading: isEn ? `Chapter ${i + 1}` : `第${i + 1}章`,
      summary: isEn ? `Part ${i + 1} of this article` : `本文第${i + 1}部分`,
    }));
  }

  return {
    title: articleTitle,
    chapters: outlines.slice(0, chapterCount).map((ch, i) => ({
      index: i,
      heading: ch.heading || (isEn ? `Chapter ${i + 1}` : `第${i + 1}章`),
      content: "",
      word_count: 0,
      summary: ch.summary || undefined,
    })),
  };
}

/**
 * English chapter prompt — injects syntax/bloom/vocab/IB constraints from SSOT.
 */
function buildChapterPromptEn(
  chapter: ArticleChapter,
  grade: number,
  chapterCount: number,
  opts: GenerateReadingOptions,
  wpc: { min: number; max: number },
  questionsPerChapter: number
): string {
  const enStd = getEnglishStandard(grade);
  const syntaxDist = getSyntaxDistribution(grade, "en");
  const bloomDist = getBloomDistribution(grade, "en");
  const vocab = getVocabScope(grade, "en");

  // Build question type distribution from SSOT bloom's
  const blooms = [bloomDist.literal, bloomDist.infer, bloomDist.evaluate, bloomDist.synthesize];
  const typeNames = ["detail", "inference", "main_idea", "sequence"];
  const qTypes: string[] = [];
  for (let i = 0; i < questionsPerChapter; i++) {
    const pos = i % 4;
    qTypes.push(blooms[pos] > 0 ? typeNames[pos] : "detail");
  }
  const typeExamples = qTypes.map((t, i) =>
    `  Q${i + 1}: question_type="${t}"`
  ).join("\n");

  const isRouteB = opts.route === "B" && !!opts.sourceText;
  const sourceSection = isRouteB
    ? `\nSOURCE TEXT FOR THIS CHAPTER (rewrite — preserve all facts):
${(opts.sourceText || "").slice(0, 2000)}`
    : `\nSource reference:
${(opts.sourceText || "").slice(0, 2000)}`;

  const depthAnchor = grade >= 6
    ? `\nACADEMIC DEPTH REQUIREMENTS (Grade ${grade}):
- Include ONE direct or paraphrased reference to a real source/expert/citation
- Use at least 3 AWL (Academic Word List) tier-2 words appropriate for Grade ${grade}
- Present at least ONE viewpoint and, where applicable, a contrasting perspective
- Each paragraph must advance a specific idea — no filler sentences`
    : grade >= 4
    ? `\nREASONING DEPTH REQUIREMENTS (Grade ${grade}):
- Include ONE inference opportunity where the reader must connect two facts
- Use at least 2 vocabulary words from the Grade ${grade} scope
- Each paragraph should build on the previous one`
    : `\nCOMPREHENSION DEPTH (Grade 3):
- Use simple cause-effect connections between sentences
- Include ONE "why do you think" moment for the reader`;

  const transitionCheck = chapter.index > 0
    ? `\nTRANSITION CHECK: This is chapter ${chapter.index + 1} of ${chapterCount}.
- DO NOT repeat facts, setting, or background already covered in chapter ${chapter.index}
- DO NOT jump ahead to events belonging in chapter ${chapter.index + 2}
- Start with a natural transition from where chapter ${chapter.index} ended
- If chapter ${chapter.index} had a question unanswered, address it here`
    : `\nTRANSITION CHECK: This is the FIRST chapter.
- Set the scene, introduce the topic
- Do NOT resolve the main question — leave it for later chapters`;

  return `Write Chapter ${chapter.index + 1} of ${chapterCount} for a Grade ${grade} reading article.

Chapter heading: "${chapter.heading}"
Chapter summary: ${chapter.summary || ""}

Topic: ${displayTopicKey(opts)}
Category: ${opts.category}
${sourceSection}

--- GRADE ${grade} SPECIFICATIONS (THIS CHAPTER) ---
CRITICAL: Write between ${wpc.min} and ${wpc.max} words for this chapter.
Sentence structure distribution:
  - Simple sentences: ${syntaxDist.simple}%
  - Compound sentences: ${syntaxDist.compound}%
  - Complex sentences: ${syntaxDist.complex}%
Vocabulary: ${vocab}
Paragraphs: ${enStd.paragraphSentencesMin}-${enStd.paragraphSentencesMax} sentences each
IB requirement: this chapter must include at least one inference or reflection opportunity.
${depthAnchor}

--- QUESTIONS (${questionsPerChapter} for this chapter) ---
Generate EXACTLY ${questionsPerChapter} questions.
Question type distribution:
${typeExamples}
Each question has 4 options (A/B/C/D), exactly one correct answer.
Difficulty scale: 1 (easiest) to 5 (hardest).

--- OUTPUT FORMAT ---
CRITICAL: Return ONLY valid JSON. No explanations, no markdown, no code fences.

{
  "content": "Chapter text...",
  "word_count": number,
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
${transitionCheck}`;
}

/**
 * Chinese chapter prompt — injects syntax/bloom/vocab constraints from SSOT.
 */
function buildChapterPromptZh(
  chapter: ArticleChapter,
  grade: number,
  chapterCount: number,
  opts: GenerateReadingOptions,
  wpc: { min: number; max: number },
  questionsPerChapter: number
): string {
  const syntaxDist = getSyntaxDistribution(grade, "zh");
  const bloomDist = getBloomDistribution(grade, "zh");
  const vocab = getVocabScope(grade, "zh");

  // Build question type distribution from SSOT bloom's
  const blooms = [bloomDist.literal, bloomDist.infer, bloomDist.evaluate, bloomDist.synthesize];
  const typeNames = ["detail", "inference", "main_idea", "sequence"];
  const qTypes: string[] = [];
  for (let i = 0; i < questionsPerChapter; i++) {
    const pos = i % 4;
    qTypes.push(blooms[pos] > 0 ? typeNames[pos] : "detail");
  }
  const typeExamples = qTypes.map((t, i) =>
    `  题${i + 1}: question_type="${t}"`
  ).join("\n");

  const isRouteB = opts.route === "B" && !!opts.sourceText;
  const sourceSection = isRouteB
    ? `\n原文参考（改写——保留所有事实）：
${(opts.sourceText || "").slice(0, 2000)}`
    : `\n原文参考：
${(opts.sourceText || "").slice(0, 2000)}`;

  const depthAnchorZh = grade >= 6
    ? `\n学术深度要求（${grade}年级）：
- 至少包含一处对真实资料/专家/引用的直接或转述引用
- 至少使用3个适合${grade}年级的学术词汇
- 至少呈现一个观点，并在适用处提供对比视角
- 每个段落必须有明确论点，不得出现填充句`
    : grade >= 4
    ? `\n推理深度要求（${grade}年级）：
- 至少包含一处推理机会，读者需连接两个事实得出结论
- 至少使用2个${grade}年级词汇范围内的词汇
- 每个段落应承接上一段内容`
    : `\n理解深度（3年级）：
- 运用简单的因果关系连接句子
- 包含一处"你觉得为什么"的思考契机`;

  const transitionCheckZh = chapter.index > 0
    ? `\n章节过渡检查：本章为第${chapter.index + 1}章，共${chapterCount}章。
- 不要重复第${chapter.index}章已覆盖的事实、背景或设定
- 不要跳至第${chapter.index + 2}章才应出现的内容
- 从第${chapter.index}章结尾处自然过渡
- 如第${chapter.index}章留有未解答的问题，本章应予以回应`
    : `\n章节过渡检查：本章为第一章。
- 介绍场景与话题
- 不要解决核心问题——留给后续章节`;

  return `请写${grade}年级阅读文章的第${chapter.index + 1}章。

章节标题："${chapter.heading}"
章节概述：${chapter.summary || ""}

主题：${displayTopicKey(opts)}
类别：${opts.category}
第${chapter.index + 1}章，共${chapterCount}章
${sourceSection}

要求：本章${wpc.min}-${wpc.max}字。
句子结构：简单句${syntaxDist.simple}%、并列句${syntaxDist.compound}%、复合句${syntaxDist.complex}%
词汇范围：${vocab}
IB要求：本章必须包含至少一个推理或思考的机会。
${depthAnchorZh}

同时创建${questionsPerChapter}道阅读理解题。
题型分布（基于${grade}年级标准）:
${typeExamples}
每道题4个选项（A/B/C/D），只有一个正确答案。

返回严格JSON（只返回JSON，不要markdown代码块）：
{
  "content": "章节内容...",
  "word_count": number,
  "questions": [
    {
      "question_text": "...",
      "question_type": "main_idea|detail|inference|vocabulary|sequence",
      "options": [{"label":"A","text":"..."},{"label":"B","text":"..."},{"label":"C","text":"..."},{"label":"D","text":"..."}],
      "correct_answer": "A",
      "difficulty": number (1-5),
      "hint": "阅读策略提示（1-2句话），不是答案",
      "explanation": "为什么正确答案是对的，用儿童友好语言解释"
    }
  ]
}
${transitionCheckZh}`;
}

/**
 * Phase 2: Generate a single chapter's content + questions.
 * Each chapter is an independent API call — can be parallelized.
 */
async function generateSingleChapter(
  chapter: ArticleChapter,
  grade: number,
  chapterCount: number,
  opts: GenerateReadingOptions
): Promise<{ content: string; word_count: number; questions: GeneratedQuestion[] }> {
  const lang = opts.language || "en";
  const isEn = lang === "en";
  const wpc = getWordsPerChapter(grade, lang);
  const questionsPerChapter = getQuestionsPerChapter(grade, lang);

  const chapterPrompt = isEn
    ? buildChapterPromptEn(chapter, grade, chapterCount, opts, wpc, questionsPerChapter)
    : buildChapterPromptZh(chapter, grade, chapterCount, opts, wpc, questionsPerChapter);

  const modelName = getModel();
  const isMiniMax = modelName.toLowerCase().includes("minimax");

  const completion = await getOpenAI().chat.completions.create({
    model: modelName,
    messages: [
      {
        role: "system",
        content: isEn
          ? "You write children's reading content. Return only valid JSON."
          : "你创作儿童阅读内容。仅返回有效JSON。",
      },
      { role: "user", content: chapterPrompt },
    ],
    temperature: 0.7,
    max_tokens: 8192,
    ...(!isMiniMax ? { response_format: { type: "json_object" } } : {}),
    reasoning_split: true,
  } as any);

  const rawText = completion.choices?.[0]?.message?.content || "{}";
  let result: Record<string, unknown>;
  try {
    result = parseJsonWithRecovery(rawText) as Record<string, unknown>;
  } catch {
    console.error(`[chapter ${chapter.index + 1}] JSON parse failed, raw length ${rawText.length}`);
    throw new Error(`Chapter ${chapter.index + 1} generation failed: LLM returned unparseable JSON`);
  }

  return {
    content: (result.content as string) || "",
    word_count: typeof result.word_count === "number" ? result.word_count : 0,
    questions: normalizeQuestions(result),
  };
}

/**
 * Chapterized generation: Phase 1 (outline) + Phase 2 (per-chapter content).
 * Each chapter is independent — can be dispatched in parallel.
 */
async function generateChapterizedContent(
  opts: GenerateReadingOptions,
  grade: number,
  lang: "en" | "zh"
): Promise<{
  article: GeneratedArticle;
  questions: GeneratedQuestion[];
  illustrations: LocalGeneratedIllustration[];
}> {
  // G3 uses 2 chapters (standards.json has chapterCount=1 for G3)
  // For G4+, use the standards-defined count
  const chapterCount = grade <= 3 ? 2 : getChapterCount(grade, lang);

  // Phase 1: outline (returns title + chapters array)
  const { title: outlineTitle, chapters: outlineChapters } = await generateChapterOutline(grade, chapterCount, opts);

  // Use LLM-generated title if available, fall back to topicKey cleanup
  const articleTitle = outlineTitle || opts.topicKey.replace(/^(en|zh)-/, "").replace(/-/g, " ") || "Untitled";

  // Phase 2: generate each chapter sequentially (respect API rate limits)
  // Future optimization: parallel with Pacer
  const chapters: ArticleChapter[] = [];
  const allQuestions: GeneratedQuestion[] = [];

  for (const outline of outlineChapters) {
    const result = await generateSingleChapter(outline, grade, chapterCount, opts);
    chapters.push({
      index: outline.index,
      heading: outline.heading,
      content: result.content,
      word_count: result.word_count,
      summary: outline.summary,
    });
    allQuestions.push(...result.questions);
  }

  const fullContent = chapters.map((ch) => ch.content).join("\n\n");
  const totalWordCount = chapters.reduce((s, ch) => s + ch.word_count, 0);

  return {
    article: {
      title: articleTitle,
      content: fullContent,
      summary: chapters[0]?.summary || "",
      word_count: totalWordCount,
      estimated_minutes: Math.max(1, Math.round(totalWordCount / (lang === "en" ? 100 : 80))),
      difficulty: grade >= 4 ? Math.min(5, grade - 1) : grade,
      scene_description: chapters[0]?.content?.slice(0, 100) || "",
      genre: (lang === "en" ? "informative" : "说明文") as GeneratedArticle["genre"],
      cultural_connection: lang === "zh" ? `本文涉及${opts.category ? "「" + opts.category + "」" : "文化"}相关内容，帮助读者了解相关文化背景知识。` : undefined,
      classical_quote: lang === "zh" ? { original: "学而不思则罔，思而不学则殆。", pinyin: "xué ér bù sī zé wǎng, sī ér bù xué zé dài.", translation: "Learning without thought is labor lost; thought without learning is perilous." } : undefined,
      author_purpose: "to inform",
      chapters,
    },
    questions: allQuestions,
    illustrations: [],
  };
}

export async function generateReadingContent(
  opts: GenerateReadingOptions
): Promise<{
  article: GeneratedArticle;
  questions: GeneratedQuestion[];
  illustrations: LocalGeneratedIllustration[];
}> {
  const effectiveGradeForDifficulty = deriveEffectiveGrade(opts);

  // G3+ uses chapterized generation for better depth and token management
  // G3 gets 2 chapters (gradeHasChapters returns false for G3 since JSON has chapterCount=1)
  const lang = opts.language || "en";
  const useChapters = opts.route !== "A" && (gradeHasChapters(effectiveGradeForDifficulty, lang) || effectiveGradeForDifficulty <= 3);
  if (useChapters) {
    return generateChapterizedContent(opts, effectiveGradeForDifficulty, lang);
  }

  // Route A: source text is already grade-appropriate. Use it directly for
  // article content; only call LLM for questions + metadata.
  if (opts.route === "A") {
    const sourceText = opts.sourceText || "";
    const prompt = opts.language === "zh"
      ? buildChineseRouteAPrompt(opts)
      : buildEnglishRouteAPrompt(opts);

    // Compute content stats locally — no LLM needed.
    const wordCount = opts.language === "zh"
      ? (sourceText.match(/[一-鿿]/g) || []).length
      : sourceText.split(/\s+/).filter(Boolean).length;
    const estimatedMinutes = Math.max(1, Math.round(wordCount / (opts.language === "en" ? 100 : 80)));
    const difficulty = calculateObjectiveDifficulty({
      content: sourceText,
      language: opts.language,
      gradeLevel: effectiveGradeForDifficulty,
    }).difficulty;

    // LLM call: only for questions + metadata. Short prompt, low max_tokens.
    const isMiniMax = getModel().toLowerCase().includes("minimax");
    const completion = await getOpenAI().chat.completions.create({
      model: getModel(),
      messages: [
        {
          role: "system",
          content: "You are a children's reading assessment expert. Output only the requested JSON fields — no article content.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 4096,
      ...(!isMiniMax ? { response_format: { type: "json_object" } } : {}),
      reasoning_split: true,
    } as any);

    const rawText = completion.choices?.[0]?.message?.content || "{}";
    let result: Record<string, unknown>;
    try {
      result = parseJsonWithRecovery(rawText) as Record<string, unknown>;
    } catch {
      // If LLM fails for questions, still return article-only result.
      result = {};
    }

    const title = (result.title as string) ||
      (opts.sourceText?.split("\n")[0]?.slice(0, 80) || "Untitled");

    return {
      article: {
        title,
        content: sourceText,
        summary: (result.summary as string) || "",
        word_count: wordCount,
        estimated_minutes: estimatedMinutes,
        difficulty,
        scene_description: (result.scene_description as string) || "",
        genre: (result.genre as GeneratedArticle["genre"]) || (opts.language === "zh" ? "记叙文" : "informative"),
        author_purpose: (result.author_purpose as GeneratedArticle["author_purpose"]) || "to inform",
        cultural_connection: result.cultural_connection as string | undefined,
        classical_quote: result.classical_quote as { original: string; pinyin: string; translation: string } | undefined,
        factual_accuracy: undefined,
      } satisfies GeneratedArticle,
      questions: Array.isArray(result.questions)
        ? (result.questions as Record<string, unknown>[])
            .filter((q) => {
              const opts = q.options;
              return Array.isArray(opts) && opts.length >= 4;
            })
            .map((q) => ({
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

  // Routes B/C: full LLM generation.
  const prompt = opts.route === "B"
    ? (opts.language === "zh" ? buildChineseRouteBPrompt(opts) : buildEnglishRouteBPrompt(opts))
    : (opts.language === "zh" ? buildChinesePrompt(opts) : buildEnglishPrompt(opts));

  const modelName = getModel();
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
    max_tokens: opts.route === "B" ? 16384 : (opts.language === "zh" ? 16384 : 32768),
    ...(!isMiniMax ? { response_format: { type: "json_object" } } : {}),
    reasoning_split: true,
  } as any);

  const rawText = completion.choices?.[0]?.message?.content || "{}";
  let result: Record<string, unknown>;
  try {
    result = parseJsonWithRecovery(rawText) as Record<string, unknown>;
  } catch {
    throw new Error(repairJsonToError(rawText));
  }

  const content = result.content as string | undefined;
  const objResult = calculateObjectiveDifficulty({
    content: content || "",
    language: opts.language,
    gradeLevel: effectiveGradeForDifficulty,
    llmDifficulty: result.difficulty as number | undefined,
  });

  validateRequiredFields(result);

  const questions = normalizeQuestions(result);
  const illustrations = normalizeIllustrations(result);

  return {
    article: {
      title: (result.title as string) || "Untitled",
      content: content || "",
      summary: (result.summary as string) || "",
      word_count: (result.word_count as number) || 0,
      estimated_minutes: (result.estimated_minutes as number) || 5,
      difficulty: objResult.difficulty,
      scene_description: (result.scene_description as string) || "",
      genre: (result.genre as GeneratedArticle["genre"]) || (opts.language === "zh" ? "记叙文" : "informative"),
      author_purpose: (result.author_purpose as GeneratedArticle["author_purpose"]) || "to inform",
      cultural_connection: result.cultural_connection as string | undefined,
      classical_quote: result.classical_quote as { original: string; pinyin: string; translation: string } | undefined,
      factual_accuracy: result.factual_accuracy as { source_facts_declared: string[]; facts_preserved_count: number } | undefined,
    } satisfies GeneratedArticle,
    questions,
    illustrations,
  };
}
