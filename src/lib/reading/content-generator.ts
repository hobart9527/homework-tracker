import OpenAI from "openai";
import { calculateObjectiveDifficulty } from "./difficulty";
import { getWordCountRange } from "./standards";
import type { GeneratedArticle, GeneratedQuestion } from "./types";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
  baseURL: process.env.OPENAI_BASE_URL || undefined,
});

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

function repairJson(raw: string): string {
  let text = raw.trim();

  // 1. Strip reasoning blocks (MiniMax)
  text = text.replace(/<think[\s\S]*?<\/think>/gi, "");
  // 2. Strip markdown fences
  text = text.replace(/```(?:json)?\s*([\s\S]*?)```/g, "$1").trim();

  // 3. Try direct parse first
  try { JSON.parse(text); return text; } catch {}

  // 4. Remove trailing commas before ] or }
  text = text.replace(/,(\s*[}\]])/g, "$1");
  try { JSON.parse(text); return text; } catch {}

  // 5. Remove non-JSON trailing content after the last structural brace
  const lastBrace = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (lastBrace > 0) {
    const truncated = text.slice(0, lastBrace + 1);
    try { JSON.parse(truncated); return truncated; } catch {}
  }

  // 6. Count braces and close unbalanced ones
  let braceCount = 0;
  let bracketCount = 0;
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') braceCount++;
    if (ch === '}') braceCount--;
    if (ch === '[') bracketCount++;
    if (ch === ']') bracketCount--;
  }
  const fixed = text + ']'.repeat(Math.max(0, bracketCount)) + '}'.repeat(Math.max(0, braceCount));
  try { JSON.parse(fixed); return fixed; } catch {}

  throw new Error(`Unable to repair JSON. Original starts with: ${text.slice(0, 200)}`);
}

function displayTopicKey(opts: GenerateReadingOptions): string {
  if (opts.language === "zh") {
    const stripped = opts.topicKey.replace(/^zh-/, '').replace(/-/g, ' ');
    return `${opts.category}：${stripped}`;
  }
  return opts.topicKey;
}

export function buildEnglishPrompt(options: GenerateReadingOptions): string {
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

自检清单完成后才能输出 JSON（GENERATION CHECKLIST）：
□ 文体自检：本文内容结构与声明的 genre "${options.category}" 一致
  - narrative：时间/地点/人物/事件/意义五要素全部存在
  - informative：定义段落 + 特征/例子段落全部存在
□ 批判思维：inference 类问题数量 ≥ 总题数 × 30%（例：8题中≥3题 inference）
□ 修辞手法（G4+）：内容中包含至少一种修辞手法（metaphor/simile/personification/idiom）
□ classical_quote：原文在 content 中逐字出现（非意译替代）
□ 改编忠实度（Tier 1/2：当提供了 Original passage 时）：
  请在 "factual_accuracy" 字段中声明 source_text 中的哪些关键事实在改编版中保留，
  格式：{ "source_facts_declared": ["事实1", "事实2", ...], "facts_preserved_count": N }
□ 如有任何一项不满足，请先修改内容，再填写 JSON 字段。

${ageGateClause}${continuityClause}${LANGUAGE_LOCK_EN}

Return STRICT JSON (no markdown, no code fences):
{
  "title": "Article title (engaging for grade ${options.gradeLevel})",
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
      "difficulty": number (1-5)
    }
  ]
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

  return `你是一位专业的中文儿童阅读内容创作专家。请为${options.gradeLevel}年级学生创作一篇阅读文章。

主题：${displayTopicKey(options)}
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
      "difficulty": number (1-5)
    }
  ]
}`;
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
      "difficulty": number (1-5)
    }
  ]
}`;
}

export async function generateArticleContent(
  options: GenerateArticleOptions
): Promise<{ article: LocalGeneratedArticle; questions: LocalGeneratedQuestion[] }> {
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
    temperature: 0.7,
    max_tokens: 4096,
  });

  const rawText = completion.choices[0]?.message?.content || "{}";
  const text = repairJson(rawText);
  const result = JSON.parse(text);

  return {
    article: {
      title: result.title || "Untitled",
      content: result.content || "",
      summary: result.summary || "",
      word_count: result.word_count || 0,
      estimated_minutes: result.estimated_minutes || 5,
      difficulty: result.difficulty || 3,
    } satisfies LocalGeneratedArticle,
    questions: (result.questions || []).map((q: Record<string, unknown>, i: number) => ({
      question_text: q.question_text || "",
      question_type: (q.question_type as LocalGeneratedQuestion["question_type"]) || "detail",
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
  article: GeneratedArticle;
  questions: GeneratedQuestion[];
  illustrations: LocalGeneratedIllustration[];
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
    temperature: 0.7,
    max_tokens: opts.language === "zh" ? 8192 : 4096,
  });

  const rawText = completion.choices[0]?.message?.content || "{}";
  const text = repairJson(rawText);
  const result = JSON.parse(text);

  // Override LLM-returned difficulty with objective calculation
  const content = result.content as string | undefined;
  const objResult = calculateObjectiveDifficulty({
    content: content || "",
    language: opts.language,
    gradeLevel: opts.gradeLevel,
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
    questions: ((result.questions || []) as Record<string, unknown>[]).map((q) => ({
      question_text: (q.question_text as string) || "",
      question_type: (q.question_type as GeneratedQuestion["question_type"]) || "detail",
      options: (q.options as { label: string; text: string }[]) || [],
      correct_answer: (q.correct_answer as string) || "A",
      difficulty: (q.difficulty as number) || 3,
    })),
    illustrations: ((result.illustrations || []) as Record<string, unknown>[]).map((ill) => {
      return {
        paragraph_index: (ill.paragraph_index as number) || 0,
        scene_description: (ill.scene_description as string) || "",
      } satisfies LocalGeneratedIllustration;
    }),
  };
}