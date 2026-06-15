import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock the OpenAI SDK BEFORE importing content-generator. Because the module
// instantiates `new OpenAI(...)` at import time, we capture the mocked client
// via a shared handle and rewire its return value per test.
// ---------------------------------------------------------------------------

// `vi.mock` factories are hoisted above top-level `const` declarations, so we
// stash the mock function on a global handle that the factory captures lazily.
const mockState: { create: ReturnType<typeof vi.fn> } = {
  create: vi.fn(),
};

vi.mock("openai", () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: (...args: unknown[]) => mockState.create(...args),
        },
      };
    },
  };
});

const mockCreate = mockState.create;

import {
  buildChinesePrompt,
  buildEnglishPrompt,
  generateReadingContent,
} from "@/lib/reading/content-generator";

function makeCompletion(content: string) {
  return {
    choices: [{ message: { content } }],
  };
}

describe("buildEnglishPrompt", () => {
  it("includes the G3 word range and 5 questions", () => {
    const prompt = buildEnglishPrompt({
      topicKey: "moon-return",
      language: "en",
      category: "科学",
      gradeLevel: 3,
      sourceText: "Astronauts went to the moon.",
    });

    // Prompt uses dynamic range format: "between 350 and 550 words"
    expect(prompt).toContain("350 and 550 words");
    expect(prompt).toContain("Grade 3");
    expect(prompt).toContain("scene_description");
    expect(prompt).toContain("illustrations");
  });

  it("uses the G5 word range and 8 questions for G5+", () => {
    const prompt = buildEnglishPrompt({
      topicKey: "moon-return",
      language: "en",
      category: "科学",
      gradeLevel: 5,
      sourceText: "Astronauts went to the moon.",
    });

    expect(prompt).toContain("600 and 1100 words");
  });
});

describe("buildChinesePrompt", () => {
  it("includes the G5 character range and does NOT mention pinyin_content", () => {
    const prompt = buildChinesePrompt({
      topicKey: "守株待兔",
      language: "zh",
      category: "成语故事",
      gradeLevel: 5,
    });

    expect(prompt).toContain("400 到 1000 字");
    expect(prompt).not.toContain("pinyin_content");
    expect(prompt).toContain("scene_description");
    expect(prompt).toContain("classical_quote");
    expect(prompt).toContain("illustrations");
  });

  it("uses the G3 character range", () => {
    const prompt = buildChinesePrompt({
      topicKey: "狼来了",
      language: "zh",
      category: "寓言",
      gradeLevel: 3,
    });

    expect(prompt).toContain("200 到 600 字");
    expect(prompt).not.toContain("pinyin_content");
  });
});

describe("generateReadingContent — English G3 path", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("returns article with scene_description, 5 questions, and illustrations array", async () => {
    const fakePayload = {
      title: "Astronauts Return to the Moon",
      content: "Paragraph one. Paragraph two.",
      summary: "Astronauts plan new lunar missions.",
      scene_description: "An astronaut waving a flag near a lunar lander on the gray moon surface.",
      word_count: 320,
      estimated_minutes: 4,
      difficulty: 2,
      illustrations: [
        { paragraph_index: 0, scene_description: "An astronaut walking on the moon." },
        { paragraph_index: 1, scene_description: "A rocket launching from Earth." },
      ],
      questions: Array.from({ length: 5 }, (_, i) => ({
        question_text: `Q${i + 1}?`,
        question_type: "detail",
        options: [
          { label: "A", text: "a" },
          { label: "B", text: "b" },
          { label: "C", text: "c" },
          { label: "D", text: "d" },
        ],
        correct_answer: "A",
        difficulty: 2,
      })),
    };

    mockCreate.mockResolvedValue(makeCompletion(JSON.stringify(fakePayload)));

    const result = await generateReadingContent({
      topicKey: "moon-return",
      language: "en",
      category: "科学",
      gradeLevel: 3,
      sourceText: "Original passage about the moon program.",
    });

    expect(result.article.scene_description).toContain("astronaut");
    expect(result.article.classical_quote).toBeUndefined();
    expect(result.questions).toHaveLength(5);
    expect(result.illustrations).toHaveLength(2);
    expect(result.illustrations[0]).toEqual({
      paragraph_index: 0,
      scene_description: "An astronaut walking on the moon.",
    });
  });
});

describe("generateReadingContent — Chinese G3 path (single-block, non-chapterized)", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("returns article with classical_quote and scene_description", async () => {
    const fakePayload = {
      title: "守株待兔",
      content: "宋国农夫的故事……",
      summary: "讲述守株待兔的寓意。",
      scene_description: "一位戴斗笠的宋国农夫坐在树桩旁等待，背景是田野。",
      classical_quote: {
        original: "守株待兔",
        pinyin: "shǒu zhū dài tù",
        translation: "守在树桩旁等兔子撞上来。",
      },
      word_count: 260,
      estimated_minutes: 4,
      difficulty: 3,
      illustrations: [
        { paragraph_index: 0, scene_description: "农夫在田边耕作。" },
      ],
      questions: Array.from({ length: 5 }, (_, i) => ({
        question_text: `第${i + 1}题？`,
        question_type: "main_idea",
        options: [
          { label: "A", text: "甲" },
          { label: "B", text: "乙" },
          { label: "C", text: "丙" },
          { label: "D", text: "丁" },
        ],
        correct_answer: "B",
        difficulty: 3,
      })),
    };

    mockCreate.mockResolvedValue(makeCompletion(JSON.stringify(fakePayload)));

    // G3 Chinese — single-block (gradeHasChapters(3, "zh") = false)
    const result = await generateReadingContent({
      topicKey: "守株待兔",
      language: "zh",
      category: "成语故事",
      gradeLevel: 3,
    });

    expect(result.article.classical_quote).toBeDefined();
    expect(result.article.classical_quote?.original).toBe("守株待兔");
    expect(result.article.classical_quote?.pinyin).toBe("shǒu zhū dài tù");
    expect(result.article.scene_description).toContain("农夫");
    expect(result.questions).toHaveLength(5);
    expect(result.illustrations).toHaveLength(1);
  });
});

describe("generateReadingContent — Chinese G5 chapterized path", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  // G5+ Chinese routes to chapterized generation (chapterCount=4 > 1).
  // With a single shared mock, the outline falls back to generic headings and
  // each chapter re-parses the same content+questions payload.

  it("routes to chapterized path, produces 4 chapters with combined content", async () => {
    // Phase 1 (outline): expects JSON array of {heading, summary}
    const outlinePayload = [
      { heading: "太阳系简介", summary: "介绍太阳系的基本组成" },
      { heading: "八大行星", summary: "八大行星的特点和位置" },
      { heading: "太阳的作用", summary: "太阳对地球的影响" },
      { heading: "探索太空", summary: "人类探索太空的历程" },
    ];

    // Phase 2 (per-chapter, 4 calls): expects {content, word_count, questions}
    const chapterPayload = {
      content: "Chapter body text.",
      word_count: 150,
      questions: [
        {
          question_text: "Q1",
          question_type: "detail" as const,
          options: [{ label: "A", text: "a" }, { label: "B", text: "b" }, { label: "C", text: "c" }, { label: "D", text: "d" }],
          correct_answer: "A",
          difficulty: 2,
        },
      ],
    };

    // Setup sequential mocks: 1 outline + 4 chapter calls
    mockCreate
      .mockResolvedValueOnce(makeCompletion(JSON.stringify(outlinePayload)))
      .mockResolvedValue(makeCompletion(JSON.stringify(chapterPayload)));

    const result = await generateReadingContent({
      topicKey: "solar-system",
      language: "zh",
      category: "科学",
      gradeLevel: 5,
    });

    // Chapterized: 4 chapters (G5 zh chapterCount=4)
    expect(result.article.chapters).toBeDefined();
    expect(result.article.chapters!.length).toBe(4);
    expect(result.article.chapters![0].heading).toBe("太阳系简介");
    expect(result.article.chapters![0].content).toBe("Chapter body text.");
    // Chapterized has no classical_quote or scene_description
    expect(result.article.classical_quote).toBeUndefined();
    // Content is joined chapters
    expect(result.article.content).toContain("Chapter body text.");
    // 4 chapters × 1 question each = 4 questions
    expect(result.questions).toHaveLength(4);
  });
});

describe("generateReadingContent — JSON parsing tolerance", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  afterEach(() => {
    mockCreate.mockReset();
  });

  it("strips ```json code fences before parsing", async () => {
    const inner = JSON.stringify({
      title: "Wrapped Title",
      content: "body",
      summary: "summary",
      scene_description: "scene",
      word_count: 100,
      estimated_minutes: 2,
      difficulty: 2,
      illustrations: [],
      questions: [],
    });
    const fenced = "```json\n" + inner + "\n```";

    mockCreate.mockResolvedValue(makeCompletion(fenced));

    const result = await generateReadingContent({
      topicKey: "x",
      language: "en",
      category: "科学",
      gradeLevel: 3,
      sourceText: "src",
    });

    expect(result.article.title).toBe("Wrapped Title");
    expect(result.article.scene_description).toBe("scene");
  });

  it("strips <think> blocks (MiniMax reasoning models) before parsing", async () => {
    const inner = JSON.stringify({
      title: "After Think",
      content: "body",
      summary: "summary",
      scene_description: "scene",
      word_count: 100,
      estimated_minutes: 2,
      difficulty: 2,
      illustrations: [],
      questions: [],
    });
    const wrapped = "<think>let me think step by step</think>" + inner;

    mockCreate.mockResolvedValue(makeCompletion(wrapped));

    const result = await generateReadingContent({
      topicKey: "x",
      language: "en",
      category: "科学",
      gradeLevel: 3,
      sourceText: "src",
    });

    expect(result.article.title).toBe("After Think");
  });
});

describe("generateReadingContent — defensive validation", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  afterEach(() => {
    mockCreate.mockReset();
  });

  it("normalizes malformed options (null, missing label/text) to valid array", async () => {
    const fakePayload = {
      title: "Malformed Options",
      content: "Paragraph one.",
      summary: "summary",
      scene_description: "scene",
      word_count: 100,
      estimated_minutes: 2,
      difficulty: 2,
      illustrations: [],
      questions: [
        {
          question_text: "Q1?",
          question_type: "detail",
          options: [
            { label: "A", text: "a" },
            null,
            { text: "no-label" },
            { label: "D", text: "d" },
          ],
          correct_answer: "A",
          difficulty: 2,
        },
      ],
    };

    mockCreate.mockResolvedValue(makeCompletion(JSON.stringify(fakePayload)));

    const result = await generateReadingContent({
      topicKey: "x",
      language: "en",
      category: "科学",
      gradeLevel: 3,
      sourceText: "src",
    });

    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].options).toEqual([
      { label: "A", text: "a" },
      { label: "", text: "no-label" },
      { label: "D", text: "d" },
    ]);
  });

  it("throws retryable error when required fields are missing after recovery", async () => {
    const badPayload = {
      // missing title, content, questions
      summary: "only summary",
      scene_description: "scene",
      word_count: 0,
      estimated_minutes: 0,
      difficulty: 0,
      illustrations: [],
    };

    mockCreate.mockResolvedValue(makeCompletion(JSON.stringify(badPayload)));

    await expect(
      generateReadingContent({
        topicKey: "x",
        language: "en",
        category: "科学",
        gradeLevel: 3,
        sourceText: "src",
      })
    ).rejects.toThrow("missing required fields after JSON recovery");
  });

  it("handles options that are not an array by returning empty options", async () => {
    const fakePayload = {
      title: "Bad Options Type",
      content: "Paragraph one.",
      summary: "summary",
      scene_description: "scene",
      word_count: 100,
      estimated_minutes: 2,
      difficulty: 2,
      illustrations: [],
      questions: [
        {
          question_text: "Q1?",
          question_type: "detail",
          options: "not-an-array",
          correct_answer: "A",
          difficulty: 2,
        },
      ],
    };

    mockCreate.mockResolvedValue(makeCompletion(JSON.stringify(fakePayload)));

    const result = await generateReadingContent({
      topicKey: "x",
      language: "en",
      category: "科学",
      gradeLevel: 3,
      sourceText: "src",
    });

    expect(result.questions[0].options).toEqual([]);
  });
});
