import { describe, it, expect } from "vitest";
import {
  validateIBCriteria,
  type IBCriteriaInput,
} from "@/lib/reading/ib-criteria-gate";
import type { GeneratedArticle, GeneratedQuestion } from "@/lib/reading/types";

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function makeArticle(
  overrides: Partial<GeneratedArticle> = {}
): GeneratedArticle {
  return {
    title: "Test Article",
    content: "The quick brown fox jumps over the lazy dog.",
    summary: "A fox jumps over a dog.",
    word_count: 9,
    estimated_minutes: 1,
    difficulty: 3,
    scene_description: "A fox jumping over a dog.",
    ...overrides,
  };
}

function makeQuestion(
  overrides: Partial<GeneratedQuestion> = {}
): GeneratedQuestion {
  return {
    question_text: "What is the main idea?",
    question_type: "main_idea",
    options: [
      { label: "A", text: "A fox jumps" },
      { label: "B", text: "A dog sleeps" },
      { label: "C", text: "A bird flies" },
      { label: "D", text: "A cat runs" },
    ],
    correct_answer: "A",
    difficulty: 3,
    ...overrides,
  };
}

function baseInput(
  overrides: Partial<IBCriteriaInput> = {}
): IBCriteriaInput {
  return {
    article: makeArticle(),
    questions: [],
    language: "en",
    gradeLevel: 3,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("validateIBCriteria (ib-criteria-gate)", () => {
  // -- Genre --

  it("1. en article missing genre → error genre-missing", () => {
    const result = validateIBCriteria(baseInput({ language: "en" }));
    const issue = result.issues.find((i) => i.code === "genre-missing");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("error");
    expect(result.pass).toBe(false);
  });

  it("2. en article with valid narrative genre → pass", () => {
    const result = validateIBCriteria(
      baseInput({ language: "en", article: makeArticle({ genre: "narrative", author_purpose: "to entertain" }) })
    );
    expect(result.issues.find((i) => i.code.startsWith("genre"))).toBeUndefined();
    expect(result.pass).toBe(true);
  });

  it("3. en article with valid informative genre → pass", () => {
    const result = validateIBCriteria(
      baseInput({ language: "en", article: makeArticle({ genre: "informative", author_purpose: "to inform" }) })
    );
    expect(result.issues.find((i) => i.code.startsWith("genre"))).toBeUndefined();
    expect(result.pass).toBe(true);
  });

  it("4. en article with valid opinion genre → pass", () => {
    const result = validateIBCriteria(
      baseInput({ language: "en", article: makeArticle({ genre: "opinion", author_purpose: "to persuade" }) })
    );
    expect(result.issues.find((i) => i.code.startsWith("genre"))).toBeUndefined();
    expect(result.pass).toBe(true);
  });

  it("5. en article with valid literary genre → pass", () => {
    const result = validateIBCriteria(
      baseInput({ language: "en", article: makeArticle({ genre: "literary", author_purpose: "to entertain" }) })
    );
    expect(result.issues.find((i) => i.code.startsWith("genre"))).toBeUndefined();
    expect(result.pass).toBe(true);
  });

  it("6. en article with invalid genre → error genre-invalid", () => {
    const result = validateIBCriteria(
      baseInput({ language: "en", article: makeArticle({ genre: "poetry" as any }) })
    );
    const issue = result.issues.find((i) => i.code === "genre-invalid");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("error");
    expect(result.pass).toBe(false);
  });

  it("7. zh article missing genre → error genre-missing", () => {
    const result = validateIBCriteria(baseInput({ language: "zh" }));
    const issue = result.issues.find((i) => i.code === "genre-missing");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("error");
    expect(result.pass).toBe(false);
  });

  it("8. zh article with valid 记叙文 genre → pass", () => {
    const result = validateIBCriteria(
      baseInput({ language: "zh", article: makeArticle({ genre: "记叙文", cultural_connection: "文化联系" }) })
    );
    expect(result.issues.find((i) => i.code.startsWith("genre"))).toBeUndefined();
    expect(result.pass).toBe(true);
  });

  it("9. zh article with valid 说明文 genre → pass", () => {
    const result = validateIBCriteria(
      baseInput({ language: "zh", article: makeArticle({ genre: "说明文", cultural_connection: "文化联系" }) })
    );
    expect(result.issues.find((i) => i.code.startsWith("genre"))).toBeUndefined();
    expect(result.pass).toBe(true);
  });

  it("10. zh article with valid 议论文 genre → pass", () => {
    const result = validateIBCriteria(
      baseInput({ language: "zh", article: makeArticle({ genre: "议论文", cultural_connection: "文化联系" }) })
    );
    expect(result.issues.find((i) => i.code.startsWith("genre"))).toBeUndefined();
    expect(result.pass).toBe(true);
  });

  it("11. zh article with valid 文学散文 genre → pass", () => {
    const result = validateIBCriteria(
      baseInput({ language: "zh", article: makeArticle({ genre: "文学散文", cultural_connection: "文化联系" }) })
    );
    expect(result.issues.find((i) => i.code.startsWith("genre"))).toBeUndefined();
    expect(result.pass).toBe(true);
  });

  it("12. zh article with invalid genre → error genre-invalid", () => {
    const result = validateIBCriteria(
      baseInput({ language: "zh", article: makeArticle({ genre: "诗歌" as any }) })
    );
    const issue = result.issues.find((i) => i.code === "genre-invalid");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("error");
    expect(result.pass).toBe(false);
  });

  it("13. en genre used on zh article → error genre-invalid", () => {
    const result = validateIBCriteria(
      baseInput({ language: "zh", article: makeArticle({ genre: "narrative" }) })
    );
    const issue = result.issues.find((i) => i.code === "genre-invalid");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("error");
    expect(result.pass).toBe(false);
  });

  // -- author_purpose --

  it("14. en article missing author_purpose → error author-purpose-missing", () => {
    const result = validateIBCriteria(
      baseInput({ language: "en", article: makeArticle({ genre: "narrative" }) })
    );
    const issue = result.issues.find((i) => i.code === "author-purpose-missing");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("error");
    expect(result.pass).toBe(false);
  });

  it("15. en article with valid author_purpose 'to inform' → pass", () => {
    const result = validateIBCriteria(
      baseInput({
        language: "en",
        article: makeArticle({ genre: "informative", author_purpose: "to inform" }),
      })
    );
    expect(result.issues.find((i) => i.code.startsWith("author-purpose"))).toBeUndefined();
    expect(result.pass).toBe(true);
  });

  it("16. en article with valid author_purpose 'to entertain' → pass", () => {
    const result = validateIBCriteria(
      baseInput({
        language: "en",
        article: makeArticle({ genre: "narrative", author_purpose: "to entertain" }),
      })
    );
    expect(result.issues.find((i) => i.code.startsWith("author-purpose"))).toBeUndefined();
    expect(result.pass).toBe(true);
  });

  it("17. en article with valid author_purpose 'to persuade' → pass", () => {
    const result = validateIBCriteria(
      baseInput({
        language: "en",
        article: makeArticle({ genre: "opinion", author_purpose: "to persuade" }),
      })
    );
    expect(result.issues.find((i) => i.code.startsWith("author-purpose"))).toBeUndefined();
    expect(result.pass).toBe(true);
  });

  it("18. en article with valid author_purpose 'to explain' → pass", () => {
    const result = validateIBCriteria(
      baseInput({
        language: "en",
        article: makeArticle({ genre: "informative", author_purpose: "to explain" }),
      })
    );
    expect(result.issues.find((i) => i.code.startsWith("author-purpose"))).toBeUndefined();
    expect(result.pass).toBe(true);
  });

  it("19. en article with invalid author_purpose → error author-purpose-invalid", () => {
    const result = validateIBCriteria(
      baseInput({
        language: "en",
        article: makeArticle({
          genre: "narrative",
          author_purpose: "to confuse" as any,
        }),
      })
    );
    const issue = result.issues.find((i) => i.code === "author-purpose-invalid");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("error");
    expect(result.pass).toBe(false);
  });

  it("20. zh article ignores author_purpose → no author-purpose issue", () => {
    const result = validateIBCriteria(
      baseInput({
        language: "zh",
        article: makeArticle({ genre: "记叙文" }),
      })
    );
    expect(result.issues.find((i) => i.code.startsWith("author-purpose"))).toBeUndefined();
  });

  // -- Critical thinking ratio --

  it("21. inference ratio < 15% → error critical-thinking-ratio-error", () => {
    const questions: GeneratedQuestion[] = [
      makeQuestion({ question_type: "main_idea" }),
      makeQuestion({ question_type: "detail", correct_answer: "B" }),
      makeQuestion({ question_type: "vocabulary", correct_answer: "C" }),
      makeQuestion({ question_type: "sequence", correct_answer: "D" }),
    ];
    const result = validateIBCriteria(
      baseInput({ language: "en", article: makeArticle({ genre: "narrative" }), questions })
    );
    const issue = result.issues.find((i) => i.code === "critical-thinking-ratio-error");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("error");
    expect(result.pass).toBe(false);
  });

  it("22. inference ratio 15-30% → warn critical-thinking-ratio-warn", () => {
    const questions: GeneratedQuestion[] = [
      makeQuestion({ question_type: "inference" }),
      makeQuestion({ question_type: "main_idea", correct_answer: "B" }),
      makeQuestion({ question_type: "detail", correct_answer: "C" }),
      makeQuestion({ question_type: "vocabulary", correct_answer: "D" }),
      makeQuestion({ question_type: "sequence", correct_answer: "A" }),
    ];
    const result = validateIBCriteria(
      baseInput({ language: "en", article: makeArticle({ genre: "narrative", author_purpose: "to entertain" }), questions })
    );
    const issue = result.issues.find((i) => i.code === "critical-thinking-ratio-warn");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("warn");
    expect(result.pass).toBe(true);
  });

  it("23. inference ratio >= 30% → pass", () => {
    const questions: GeneratedQuestion[] = [
      makeQuestion({ question_type: "inference" }),
      makeQuestion({ question_type: "inference", correct_answer: "B" }),
      makeQuestion({ question_type: "inference", correct_answer: "C" }),
      makeQuestion({ question_type: "main_idea", correct_answer: "D" }),
      makeQuestion({ question_type: "detail", correct_answer: "A" }),
    ];
    const result = validateIBCriteria(
      baseInput({ language: "en", article: makeArticle({ genre: "narrative", author_purpose: "to entertain" }), questions })
    );
    expect(result.issues.find((i) => i.code.startsWith("critical-thinking-ratio"))).toBeUndefined();
    expect(result.pass).toBe(true);
  });

  it("24. empty questions → skip critical thinking check", () => {
    const result = validateIBCriteria(
      baseInput({ language: "en", article: makeArticle({ genre: "narrative", author_purpose: "to entertain" }), questions: [] })
    );
    expect(result.issues.find((i) => i.code.startsWith("critical-thinking-ratio"))).toBeUndefined();
    expect(result.pass).toBe(true);
  });

  // -- cultural_connection --

  it("25. zh article missing cultural_connection → error cultural-connection-missing", () => {
    const result = validateIBCriteria(
      baseInput({ language: "zh", article: makeArticle({ genre: "记叙文" }) })
    );
    const issue = result.issues.find((i) => i.code === "cultural-connection-missing");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("error");
    expect(result.pass).toBe(false);
  });

  it("26. zh article with empty cultural_connection → error cultural-connection-missing", () => {
    const result = validateIBCriteria(
      baseInput({
        language: "zh",
        article: makeArticle({ genre: "记叙文", cultural_connection: "" }),
      })
    );
    const issue = result.issues.find((i) => i.code === "cultural-connection-missing");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("error");
    expect(result.pass).toBe(false);
  });

  it("27. zh article with whitespace-only cultural_connection → error cultural-connection-missing", () => {
    const result = validateIBCriteria(
      baseInput({
        language: "zh",
        article: makeArticle({ genre: "记叙文", cultural_connection: "   " }),
      })
    );
    const issue = result.issues.find((i) => i.code === "cultural-connection-missing");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("error");
    expect(result.pass).toBe(false);
  });

  it("28. zh article with valid cultural_connection → pass", () => {
    const result = validateIBCriteria(
      baseInput({
        language: "zh",
        article: makeArticle({
          genre: "记叙文",
          cultural_connection: "这篇文章反映了中国传统文化中的家庭观念。",
        }),
      })
    );
    expect(result.issues.find((i) => i.code === "cultural-connection-missing")).toBeUndefined();
    expect(result.pass).toBe(true);
  });

  it("29. en article ignores cultural_connection → no cultural-connection issue", () => {
    const result = validateIBCriteria(
      baseInput({
        language: "en",
        article: makeArticle({ genre: "narrative", author_purpose: "to entertain" }),
      })
    );
    expect(result.issues.find((i) => i.code.startsWith("cultural-connection"))).toBeUndefined();
    expect(result.pass).toBe(true);
  });

  // -- Combined / edge cases --

  it("30. en happy path with all valid fields → pass=true, no issues", () => {
    const questions: GeneratedQuestion[] = [
      makeQuestion({ question_type: "inference" }),
      makeQuestion({ question_type: "inference", correct_answer: "B" }),
      makeQuestion({ question_type: "main_idea", correct_answer: "C" }),
    ];
    const result = validateIBCriteria(
      baseInput({
        language: "en",
        article: makeArticle({
          genre: "narrative",
          author_purpose: "to entertain",
        }),
        questions,
      })
    );
    expect(result.issues).toEqual([]);
    expect(result.pass).toBe(true);
  });

  it("31. zh happy path with all valid fields → pass=true, no issues", () => {
    const questions: GeneratedQuestion[] = [
      makeQuestion({ question_type: "inference" }),
      makeQuestion({ question_type: "inference", correct_answer: "B" }),
      makeQuestion({ question_type: "main_idea", correct_answer: "C" }),
    ];
    const result = validateIBCriteria(
      baseInput({
        language: "zh",
        article: makeArticle({
          genre: "记叙文",
          cultural_connection: "体现了中国传统节日文化。",
        }),
        questions,
      })
    );
    expect(result.issues).toEqual([]);
    expect(result.pass).toBe(true);
  });

  it("32. multiple errors → pass=false with all issues reported", () => {
    const result = validateIBCriteria(
      baseInput({ language: "zh" })
    );
    expect(result.issues).toHaveLength(2);
    expect(result.issues.some((i) => i.code === "genre-missing")).toBe(true);
    expect(result.issues.some((i) => i.code === "cultural-connection-missing")).toBe(true);
    expect(result.pass).toBe(false);
  });
});
