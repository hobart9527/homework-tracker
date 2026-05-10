import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
  baseURL: process.env.OPENAI_BASE_URL || undefined,
});

// ---------------------------------------------------------------------------
// Legacy types — kept for backward compatibility with existing callers.
// The canonical types live in ./types.ts and are re-exported from index.ts.
// ---------------------------------------------------------------------------

export interface GeneratedArticle {
  title: string;
  content: string;
  summary: string;
  word_count: number;
  estimated_minutes: number;
  difficulty: number; // 1-5
}

export interface GeneratedQuestion {
  question_text: string;
  question_type: "main_idea" | "detail" | "inference" | "vocabulary" | "sequence";
  options: { label: string; text: string }[];
  correct_answer: string;
  difficulty: number; // 1-5
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

export interface GenerateReadingOptions {
  topicKey: string;
  language: "zh" | "en"; // never 'zh+en' per Q6 (single-language enforcement)
  category: string;
  gradeLevel: number; // primary grade kept for backward-compat
  sourceText?: string; // optional for zh
  // NEW (W0a) — all OPTIONAL for backward-compat:
  recommendedLevels?: string[]; // e.g., ['L4','L5'] — RAZ level codes; upper bound used to derive effective grade
  contentWarnings?: string[]; // e.g., ['war','death','politics'] — triggers age-gate clause when gradeLevel<5
  packId?: string;
  packOrder?: number; // 1-based position within pack
  previousTopicSummary?: string; // narrative continuity hint when packOrder>1
}

export interface GeneratedIllustration {
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
 */
function deriveEffectiveGrade(options: GenerateReadingOptions): number {
  const levels = options.recommendedLevels;
  if (!levels || levels.length === 0) return options.gradeLevel;
  const nums = levels
    .map((l) => {
      const m = /^L(\d+)$/i.exec(l.trim());
      return m ? parseInt(m[1], 10) : NaN;
    })
    .filter((n) => Number.isFinite(n));
  if (nums.length === 0) return options.gradeLevel;
  return Math.max(...nums);
}

/** Behavior B — age-appropriateness clause (only when raw gradeLevel < 5 AND warnings present). */
function buildAgeGateClauseEn(options: GenerateReadingOptions): string {
  if (options.gradeLevel >= 5) return "";
  const warnings = options.contentWarnings;
  if (!warnings || warnings.length === 0) return "";
  return `\n\nAGE-APPROPRIATENESS: This article must be suitable for a Grade ${options.gradeLevel} child. The topic involves [${warnings.join(", ")}]. Use a kid-friendly, calm tone. Do NOT include graphic violence, political controversy, or anything frightening. Focus on factual context and human resilience.`;
}

function buildAgeGateClauseZh(options: GenerateReadingOptions): string {
  if (options.gradeLevel >= 5) return "";
  const warnings = options.contentWarnings;
  if (!warnings || warnings.length === 0) return "";
  return `\n\n适龄性要求：本文须适合${options.gradeLevel}年级孩子阅读。题材涉及 [${warnings.join("、")}]。使用儿童友好、平和的语气。禁止血腥暴力描写、政治争议或令人恐惧的内容。聚焦于事实背景和人类的坚韧。`;
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

export function buildEnglishPrompt(options: GenerateReadingOptions): string {
  // Behavior A: effective grade drives wordLimit / questionCount / focusAreas.
  const effectiveGrade = deriveEffectiveGrade(options);
  const wordLimit = effectiveGrade <= 4 ? "300-450 words" : "500-800 words";
  const questionCount = effectiveGrade <= 4 ? 5 : 8;
  const focusAreas = effectiveGrade <= 4
    ? "Detail and vocabulary questions (easier)"
    : "Main idea and inference questions (more analytical)";

  const ageGateClause = buildAgeGateClauseEn(options);
  const continuityClause = buildPackContinuityClauseEn(options);

  return `You are adapting a reading passage for a Grade ${options.gradeLevel} student (age ${options.gradeLevel + 5}).

Original passage:
${(options.sourceText || "").slice(0, 6000)}

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

In addition, provide:
- scene_description: a single vivid sentence describing a key scene from the article (used for cover image generation)
- illustrations: an array of 1-2 objects, each with { paragraph_index, scene_description } for in-article images${ageGateClause}${continuityClause}${LANGUAGE_LOCK_EN}

Return STRICT JSON (no markdown, no code fences):
{
  "title": "Article title (engaging for grade ${options.gradeLevel})",
  "content": "Full article text...",
  "summary": "One-sentence summary (max 30 words)",
  "word_count": number,
  "estimated_minutes": number,
  "difficulty": number (1-5),
  "scene_description": "A single vivid sentence describing a key scene...",
  "illustrations": [
    { "paragraph_index": 0, "scene_description": "..." }
  ],
  "questions": [
    {
      "question_text": "...",
      "question_type": "main_idea|detail|inference|vocabulary|sequence",
      "options": [{"label":"A","text":"..."},{"label":"B","text":"..."},{"label":"C","text":"..."},{"label":"D","text":"..."}],
      "correct_answer": "A",
      "difficulty": number (1-5)
    }
  ]
}`;
}

export function buildChinesePrompt(options: GenerateReadingOptions): string {
  // Behavior A: effective grade drives charLimit / questionCount / focusAreas.
  const effectiveGrade = deriveEffectiveGrade(options);
  const charLimit = effectiveGrade <= 3
    ? "150-220"
    : effectiveGrade === 4
      ? "180-280"
      : effectiveGrade === 5
        ? "220-350"
        : effectiveGrade === 6
          ? "280-420"
          : "350-500";
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

  return `你是一位专业的中文儿童阅读内容创作专家。请为${options.gradeLevel}年级学生创作一篇阅读文章。

主题：${options.topicKey}
类别：${options.category}
${sourcePassageBlock}
要求：
- 字数范围：${charLimit}字
- 适合${options.gradeLevel}年级学生的词汇和句子复杂度
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
- illustrations：1-2个插图对象数组，每个包含 { paragraph_index, scene_description }${ageGateClause}${continuityClause}${LANGUAGE_LOCK_ZH}

返回严格的JSON格式（不要markdown，不要代码块）：
{
  "title": "文章标题",
  "content": "完整文章内容...",
  "summary": "一句话总结（最多30字）",
  "word_count": number,
  "estimated_minutes": number,
  "difficulty": number (1-5),
  "scene_description": "一句话描述关键场景...",
  "classical_quote": {
    "original": "原文",
    "pinyin": "拼音",
    "translation": "译文"
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
      "difficulty": number (1-5)
    }
  ]
}`;
}

// ---------------------------------------------------------------------------
// Legacy API — preserved for backward compatibility.
// ---------------------------------------------------------------------------

function buildGenerationPrompt(options: GenerateArticleOptions): string {
  const wordLimit = options.gradeLevel <= 4 ? "300-450 words" : "500-800 words";
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
      "difficulty": number (1-5)
    }
  ]
}`;
}

export async function generateArticleContent(
  options: GenerateArticleOptions
): Promise<{ article: GeneratedArticle; questions: GeneratedQuestion[] }> {
  const prompt = buildGenerationPrompt(options);

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_READING_MODEL || "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are an expert children's reading content creator. You adapt articles for specific grade levels and create comprehension questions. Always respond with valid JSON only, no markdown formatting.",
      },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_tokens: 4096,
  });

  const rawText = completion.choices[0]?.message?.content || "{}";
  // Strip <think>...</think> blocks (MiniMax reasoning models) and markdown fences
  const text = rawText
    .replace(/<think[\s\S]*?<\/think>/gi, "")
    .replace(/```(?:json)?\s*([\s\S]*?)```/g, "$1")
    .trim() || "{}";
  const result = JSON.parse(text);

  return {
    article: {
      title: result.title || "Untitled",
      content: result.content || "",
      summary: result.summary || "",
      word_count: result.word_count || 0,
      estimated_minutes: result.estimated_minutes || 5,
      difficulty: result.difficulty || 3,
    },
    questions: (result.questions || []).map((q: Record<string, unknown>, i: number) => ({
      question_text: q.question_text || "",
      question_type: (q.question_type as GeneratedQuestion["question_type"]) || "detail",
      options: (q.options as { label: string; text: string }[]) || [],
      correct_answer: (q.correct_answer as string) || "A",
      difficulty: (q.difficulty as number) || 3,
    })),
  };
}

// ---------------------------------------------------------------------------
// New unified API
// ---------------------------------------------------------------------------

export async function generateReadingContent(
  opts: GenerateReadingOptions
): Promise<{
  article: GeneratedArticle & { scene_description: string; classical_quote?: { original: string; pinyin: string; translation: string } };
  questions: GeneratedQuestion[];
  illustrations: GeneratedIllustration[];
}> {
  const prompt = opts.language === "zh" ? buildChinesePrompt(opts) : buildEnglishPrompt(opts);

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_READING_MODEL || "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are an expert children's reading content creator. You create reading articles and comprehension questions for students. Always respond with valid JSON only, no markdown formatting.",
      },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_tokens: 4096,
  });

  const rawText = completion.choices[0]?.message?.content || "{}";
  // Strip <think>...</think> blocks (MiniMax reasoning models) and markdown fences
  const text = rawText
    .replace(/<think[\s\S]*?<\/think>/gi, "")
    .replace(/```(?:json)?\s*([\s\S]*?)```/g, "$1")
    .trim() || "{}";
  const result = JSON.parse(text);

  return {
    article: {
      title: result.title || "Untitled",
      content: result.content || "",
      summary: result.summary || "",
      word_count: result.word_count || 0,
      estimated_minutes: result.estimated_minutes || 5,
      difficulty: result.difficulty || 3,
      scene_description: result.scene_description || "",
      classical_quote: result.classical_quote || undefined,
    },
    questions: (result.questions || []).map((q: Record<string, unknown>) => ({
      question_text: q.question_text || "",
      question_type: (q.question_type as GeneratedQuestion["question_type"]) || "detail",
      options: (q.options as { label: string; text: string }[]) || [],
      correct_answer: (q.correct_answer as string) || "A",
      difficulty: (q.difficulty as number) || 3,
    })),
    illustrations: (result.illustrations || []).map((ill: Record<string, unknown>) => ({
      paragraph_index: (ill.paragraph_index as number) || 0,
      scene_description: (ill.scene_description as string) || "",
    })),
  };
}
