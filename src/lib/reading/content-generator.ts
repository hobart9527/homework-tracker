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
  language: "zh" | "en";
  category: string;
  gradeLevel: number;
  sourceText?: string; // optional for zh
}

export interface GeneratedIllustration {
  paragraph_index: number;
  scene_description: string;
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

export function buildEnglishPrompt(options: GenerateReadingOptions): string {
  const wordLimit = options.gradeLevel <= 4 ? "300-450 words" : "500-800 words";
  const questionCount = options.gradeLevel <= 4 ? 5 : 8;
  const focusAreas = options.gradeLevel <= 4
    ? "Detail and vocabulary questions (easier)"
    : "Main idea and inference questions (more analytical)";

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
  const charLimit = options.gradeLevel <= 3
    ? "150-220"
    : options.gradeLevel === 4
      ? "180-280"
      : options.gradeLevel === 5
        ? "220-350"
        : options.gradeLevel === 6
          ? "280-420"
          : "350-500";
  const questionCount = options.gradeLevel <= 4 ? 5 : 8;
  const focusAreas = options.gradeLevel <= 4
    ? "Detail and vocabulary questions (easier)"
    : "Main idea and inference questions (more analytical)";

  return `你是一位专业的中文儿童阅读内容创作专家。请为${options.gradeLevel}年级学生创作一篇阅读文章。

主题：${options.topicKey}
类别：${options.category}

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
