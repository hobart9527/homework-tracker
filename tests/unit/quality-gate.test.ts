import { describe, it, expect } from "vitest";
import {
  validateContent,
  type QualityGateInput,
} from "@/lib/reading/quality-gate";
import type { GeneratedArticle, GeneratedQuestion } from "@/lib/reading/types";

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function makeEnArticle(overrides: Partial<GeneratedArticle> = {}): GeneratedArticle {
  // 360-word lorem-style article (within G3-4 300-450 range).
  const sentence =
    "The curious red fox darted across the wide green meadow chasing a fluttering yellow butterfly. ";
  const content = sentence.repeat(45).trim(); // 12 words * 45 = 540 ... adjust
  // Trim/pad to land safely inside 300-450.
  const words = content.split(/\s+/).slice(0, 360).join(" ");
  return {
    title: "The Curious Fox",
    content: words,
    summary: "A fox chases a butterfly through a meadow.",
    word_count: 360,
    estimated_minutes: 4,
    difficulty: 3,
    scene_description: "A red fox in a sunny green meadow chasing a yellow butterfly.",
    ...overrides,
  };
}

function makeZhArticle(overrides: Partial<GeneratedArticle> = {}): GeneratedArticle {
  // ~180 Chinese characters (within G3 150-220 range).
  const sentence = "今天天气很好我们一起去公园玩耍看见了许多美丽的花朵和飞舞的蝴蝶大家都非常开心地笑了起来。";
  // sentence has ~40 chars; repeat ~5 times for ~200 chars.
  const base = sentence.repeat(5);
  return {
    title: "公园的一天",
    content: base,
    summary: "记录一天在公园的快乐时光。",
    word_count: 200,
    estimated_minutes: 3,
    difficulty: 3,
    scene_description: "孩子们在公园里追逐蝴蝶。",
    classical_quote: {
      original: "今天天气",
      pinyin: "jīn tiān tiān qì",
      translation: "今日的天气",
    },
    ...overrides,
  };
}

function makeQuestion(
  overrides: Partial<GeneratedQuestion> = {}
): GeneratedQuestion {
  return {
    question_text: "What is the main idea of the passage?",
    question_type: "main_idea",
    options: [
      { label: "A", text: "A fox chases a butterfly" },
      { label: "B", text: "A bird sings in a tree" },
      { label: "C", text: "Children play soccer" },
      { label: "D", text: "It rains all day" },
    ],
    correct_answer: "A",
    difficulty: 3,
    ...overrides,
  };
}

function makeMixedEnQuestions(): GeneratedQuestion[] {
  return [
    makeQuestion({ question_type: "main_idea" }),
    makeQuestion({ question_type: "detail", correct_answer: "B" }),
    makeQuestion({ question_type: "vocabulary", correct_answer: "C" }),
    makeQuestion({ question_type: "inference", correct_answer: "D" }),
    makeQuestion({ question_type: "sequence", correct_answer: "A" }),
  ];
}

function baseInput(
  overrides: Partial<QualityGateInput> = {}
): QualityGateInput {
  return {
    article: makeEnArticle(),
    questions: makeMixedEnQuestions(),
    language: "en",
    gradeLevel: 3,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("validateContent (quality-gate)", () => {
  it("1. en G3 happy path → pass=true and no issues", () => {
    const result = validateContent(baseInput());
    expect(result.pass).toBe(true);
    expect(result.recommended_status).toBe("published");
    expect(result.issues).toEqual([]);
  });

  it("2. en G3 word_count well below range → error word-count-out-of-range", () => {
    const shortContent = "The fox runs fast.".repeat(20).trim(); // ~80 words, < 300 by >50%
    const article = makeEnArticle({ content: shortContent });
    const result = validateContent(baseInput({ article }));
    const wc = result.issues.find((i) => i.code === "word-count-out-of-range");
    expect(wc).toBeDefined();
    expect(wc?.severity).toBe("error");
    expect(result.pass).toBe(false);
    expect(result.recommended_status).toBe("draft");
  });

  it('3. en G3 question with correct_answer="E" not in options → error question-correct-not-in-options', () => {
    const questions = makeMixedEnQuestions();
    questions[0] = makeQuestion({ correct_answer: "E" });
    const result = validateContent(baseInput({ questions }));
    const issue = result.issues.find(
      (i) => i.code === "question-correct-not-in-options"
    );
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("error");
    expect(result.pass).toBe(false);
  });

  it('4. en G3 question with two options labeled "A" → error question-multiple-correct', () => {
    const questions = makeMixedEnQuestions();
    questions[0] = makeQuestion({
      options: [
        { label: "A", text: "first A option" },
        { label: "A", text: "duplicate A option" },
        { label: "C", text: "third option" },
        { label: "D", text: "fourth option" },
      ],
      correct_answer: "A",
    });
    const result = validateContent(baseInput({ questions }));
    const issue = result.issues.find(
      (i) => i.code === "question-multiple-correct"
    );
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("error");
    expect(result.pass).toBe(false);
  });

  it('5. G5 with 5 detail-only questions → warn question-type-distribution-skew', () => {
    const questions: GeneratedQuestion[] = [
      makeQuestion({ question_type: "detail" }),
      makeQuestion({ question_type: "detail", correct_answer: "B" }),
      makeQuestion({ question_type: "detail", correct_answer: "C" }),
      makeQuestion({ question_type: "detail", correct_answer: "D" }),
      makeQuestion({ question_type: "detail", correct_answer: "A" }),
    ];
    // For grade=5 we need a G5 word range. Build a longer article.
    const longContent =
      "The student studied carefully every single evening at the small wooden desk by the window. ".repeat(40);
    const article = makeEnArticle({
      content: longContent.split(/\s+/).slice(0, 600).join(" "),
    });
    const result = validateContent({
      article,
      questions,
      language: "en",
      gradeLevel: 5,
    });
    const skew = result.issues.find(
      (i) => i.code === "question-type-distribution-skew"
    );
    expect(skew).toBeDefined();
    expect(skew?.severity).toBe("warn");
    // Skew is a warn, so pass should still be true if no errors elsewhere.
    expect(result.pass).toBe(true);
  });

  it("6. en G3 difficulty=5 with very short content → info difficulty-vs-word-count-mismatch", () => {
    // 100 words is below 300-450 (so will also produce a word-count error),
    // but we only assert on the info issue here.
    const short = "She walked slowly toward the silent old library doorway. ".repeat(15);
    const article = makeEnArticle({
      content: short.split(/\s+/).slice(0, 100).join(" "),
      difficulty: 5,
    });
    const result = validateContent(baseInput({ article }));
    const info = result.issues.find(
      (i) => i.code === "difficulty-vs-word-count-mismatch"
    );
    expect(info).toBeDefined();
    expect(info?.severity).toBe("info");
  });

  it("7. zh G3 happy path with valid content → pass=true and pinyin check passes", () => {
    const questions: GeneratedQuestion[] = [
      makeQuestion({ question_type: "main_idea", question_text: "文章的主旨是什么？" }),
      makeQuestion({ question_type: "detail", correct_answer: "B", question_text: "细节问题" }),
      makeQuestion({ question_type: "vocabulary", correct_answer: "C", question_text: "词汇问题" }),
      makeQuestion({ question_type: "inference", correct_answer: "D", question_text: "推理问题" }),
    ];
    const result = validateContent({
      article: makeZhArticle(),
      questions,
      language: "zh",
      gradeLevel: 3,
    });
    expect(result.pass).toBe(true);
    expect(result.recommended_status).toBe("published");
    expect(
      result.issues.find((i) => i.code === "pinyin-char-count-mismatch")
    ).toBeUndefined();
    expect(
      result.issues.find((i) => i.code === "classical-quote-not-in-content")
    ).toBeUndefined();
  });

  it("8. zh G3 article without classical_quote → warn classical-quote-not-in-content", () => {
    const article = makeZhArticle();
    delete article.classical_quote;
    const questions: GeneratedQuestion[] = [
      makeQuestion({ question_type: "main_idea", question_text: "主旨" }),
      makeQuestion({ question_type: "detail", correct_answer: "B", question_text: "细节" }),
      makeQuestion({ question_type: "vocabulary", correct_answer: "C", question_text: "词汇" }),
      makeQuestion({ question_type: "inference", correct_answer: "D", question_text: "推理" }),
    ];
    const result = validateContent({
      article,
      questions,
      language: "zh",
      gradeLevel: 3,
    });
    const issue = result.issues.find(
      (i) => i.code === "classical-quote-not-in-content"
    );
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("warn");
    // warn does not flip pass to false.
    expect(result.pass).toBe(true);
  });

  it("9. zh classical_quote.original not present in content → warn classical-quote-not-in-content", () => {
    const article = makeZhArticle({
      classical_quote: {
        original: "完全不相关的古文",
        pinyin: "...",
        translation: "...",
      },
    });
    const questions: GeneratedQuestion[] = [
      makeQuestion({ question_type: "main_idea", question_text: "主旨" }),
      makeQuestion({ question_type: "detail", correct_answer: "B", question_text: "细节" }),
      makeQuestion({ question_type: "vocabulary", correct_answer: "C", question_text: "词汇" }),
      makeQuestion({ question_type: "inference", correct_answer: "D", question_text: "推理" }),
    ];
    const result = validateContent({
      article,
      questions,
      language: "zh",
      gradeLevel: 3,
    });
    const issue = result.issues.find(
      (i) => i.code === "classical-quote-not-in-content"
    );
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("warn");
  });
});
