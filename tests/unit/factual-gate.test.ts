import { describe, it, expect } from "vitest";
import {
  validateFactualAccuracy,
  type FactualGateInput,
} from "@/lib/reading/factual-gate";
import type { GeneratedArticle } from "@/lib/reading/types";

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

function baseInput(
  overrides: Partial<FactualGateInput> = {}
): FactualGateInput {
  return {
    article: makeArticle(),
    sourceText: "The quick brown fox jumps over the lazy dog.",
    language: "en",
    gradeLevel: 3,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("validateFactualAccuracy (factual-gate)", () => {
  it("1. Tier 3 skip: sourceText undefined → pass=true, no issues", () => {
    const result = validateFactualAccuracy(baseInput({ sourceText: undefined }));
    expect(result.pass).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("2. Tier 3 skip: sourceText empty string → pass=true, no issues", () => {
    const result = validateFactualAccuracy(baseInput({ sourceText: "" }));
    expect(result.pass).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("3. Tier 3 skip: sourceText whitespace only → pass=true, no issues", () => {
    const result = validateFactualAccuracy(baseInput({ sourceText: "   " }));
    expect(result.pass).toBe(true);
    expect(result.issues).toEqual([]);
  });

  // -- checkFactsPreserved --

  it("4. facts_preserved_count / total >= 0.8 → pass (no issue)", () => {
    const article = makeArticle({
      factual_accuracy: {
        source_facts_declared: ["fact A", "fact B", "fact C", "fact D", "fact E"],
        facts_preserved_count: 4,
      },
    });
    const result = validateFactualAccuracy(baseInput({ article }));
    expect(result.issues).toEqual([]);
    expect(result.pass).toBe(true);
  });

  it("5. facts_preserved_count / total 0.6-0.8 → warn severity", () => {
    const article = makeArticle({
      factual_accuracy: {
        source_facts_declared: ["fact A", "fact B", "fact C", "fact D", "fact E"],
        facts_preserved_count: 3,
      },
    });
    const result = validateFactualAccuracy(baseInput({ article }));
    const issue = result.issues.find((i) => i.code === "factual-accuracy-rate-warn");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("warn");
    expect(result.pass).toBe(true);
  });

  it("6. facts_preserved_count / total < 0.6 → error severity, pass=false", () => {
    const article = makeArticle({
      factual_accuracy: {
        source_facts_declared: ["fact A", "fact B", "fact C", "fact D", "fact E"],
        facts_preserved_count: 2,
      },
    });
    const result = validateFactualAccuracy(baseInput({ article }));
    const issue = result.issues.find((i) => i.code === "factual-accuracy-rate-error");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("error");
    expect(result.pass).toBe(false);
  });

  it("7. no source_facts_declared → skip checkFactsPreserved", () => {
    const article = makeArticle({
      factual_accuracy: {
        source_facts_declared: [],
        facts_preserved_count: 0,
      },
    });
    const result = validateFactualAccuracy(baseInput({ article }));
    expect(result.issues.find((i) => i.code.startsWith("factual-accuracy-rate"))).toBeUndefined();
    expect(result.pass).toBe(true);
  });

  it("8. factual_accuracy undefined → skip checkFactsPreserved", () => {
    const article = makeArticle();
    delete (article as any).factual_accuracy;
    const result = validateFactualAccuracy(baseInput({ article }));
    expect(result.issues.find((i) => i.code.startsWith("factual-accuracy-rate"))).toBeUndefined();
    expect(result.pass).toBe(true);
  });

  // -- checkSourceTextLength --

  it("9. ratio > 5 → error severity", () => {
    const sourceText = "Fox runs.";
    const article = makeArticle({
      content: "The quick brown fox jumps over the lazy dog. ".repeat(20),
    });
    const result = validateFactualAccuracy(
      baseInput({ article, sourceText, language: "en" })
    );
    const issue = result.issues.find((i) => i.code === "content-bloat-error");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("error");
    expect(result.pass).toBe(false);
  });

  it("10. ratio 3-5 → warn severity", () => {
    // source = 18 words, article = 81 words → ratio = 4.5
    const sourceText = "The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog.";
    const article = makeArticle({
      content: "The quick brown fox jumps over the lazy dog. ".repeat(9),
    });
    const result = validateFactualAccuracy(
      baseInput({ article, sourceText, language: "en" })
    );
    const issue = result.issues.find((i) => i.code === "content-bloat-warn");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("warn");
    expect(result.pass).toBe(true);
  });

  it("11. ratio <= 3 → pass (no issue)", () => {
    const sourceText = "The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog.";
    const article = makeArticle({
      content: "The quick brown fox jumps over the lazy dog. ".repeat(5),
    });
    const result = validateFactualAccuracy(
      baseInput({ article, sourceText, language: "en" })
    );
    expect(result.issues.find((i) => i.code.startsWith("content-bloat"))).toBeUndefined();
    expect(result.pass).toBe(true);
  });

  it("12. sourceText empty → skip checkSourceTextLength", () => {
    const article = makeArticle({ content: "Some long content here. ".repeat(50) });
    const result = validateFactualAccuracy(
      baseInput({ article, sourceText: "", language: "en" })
    );
    expect(result.pass).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("13. zh ratio > 5 → error severity (char count)", () => {
    const sourceText = "狐狸跑。";
    const article = makeArticle({
      content: "一只快速的棕色狐狸跳过了懒惰的狗。".repeat(10),
    });
    const result = validateFactualAccuracy(
      baseInput({ article, sourceText, language: "zh" })
    );
    const issue = result.issues.find((i) => i.code === "content-bloat-error");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("error");
    expect(result.pass).toBe(false);
  });

  // -- checkKeyFactMentions --

  it("14. all keyFacts present → pass (no issue)", () => {
    const article = makeArticle({ content: "The quick brown fox jumps over the lazy dog." });
    const result = validateFactualAccuracy(
      baseInput({ article, keyFacts: ["fox", "dog"] })
    );
    expect(result.issues.find((i) => i.code === "key-fact-missing")).toBeUndefined();
    expect(result.pass).toBe(true);
  });

  it("15. missing keyFact → error severity, pass=false", () => {
    const article = makeArticle({ content: "The quick brown fox jumps over the lazy dog." });
    const result = validateFactualAccuracy(
      baseInput({ article, keyFacts: ["fox", "cat"] })
    );
    const issue = result.issues.find((i) => i.code === "key-fact-missing");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("error");
    expect(issue?.message).toContain("cat");
    expect(result.pass).toBe(false);
  });

  it("16. multiple missing keyFacts → multiple errors", () => {
    const article = makeArticle({ content: "The quick brown fox jumps over the lazy dog." });
    const result = validateFactualAccuracy(
      baseInput({ article, keyFacts: ["elephant", "cat"] })
    );
    const issues = result.issues.filter((i) => i.code === "key-fact-missing");
    expect(issues).toHaveLength(2);
    expect(result.pass).toBe(false);
  });

  it("17. empty keyFacts → skip checkKeyFactMentions", () => {
    const result = validateFactualAccuracy(baseInput({ keyFacts: [] }));
    expect(result.issues.find((i) => i.code === "key-fact-missing")).toBeUndefined();
    expect(result.pass).toBe(true);
  });

  it("18. zh keyFact present (substring match) → pass", () => {
    const article = makeArticle({ content: "一只快速的棕色狐狸跳过了懒惰的狗。" });
    const result = validateFactualAccuracy(
      baseInput({ article, sourceText: "一只狐狸跳过狗。", keyFacts: ["狐狸", "狗"], language: "zh" })
    );
    expect(result.issues.find((i) => i.code === "key-fact-missing")).toBeUndefined();
    expect(result.pass).toBe(true);
  });

  it("19. zh keyFact missing → error", () => {
    const article = makeArticle({ content: "一只快速的棕色狐狸跳过了懒惰的狗。" });
    const result = validateFactualAccuracy(
      baseInput({ article, keyFacts: ["狐狸", "猫"], language: "zh" })
    );
    const issue = result.issues.find((i) => i.code === "key-fact-missing");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("error");
    expect(result.pass).toBe(false);
  });

  it("20. combined checks: warn + error → pass=false", () => {
    // source = 18 words, article = 90 words → ratio = 5.0 (warn)
    // facts_preserved_count / total = 1/2 = 0.5 → error
    // keyFact "elephant" missing → error
    const article = makeArticle({
      content: "The quick brown fox jumps over the lazy dog. ".repeat(10),
      factual_accuracy: {
        source_facts_declared: ["fact A", "fact B"],
        facts_preserved_count: 1,
      },
    });
    const result = validateFactualAccuracy(
      baseInput({
        article,
        sourceText: "The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog.",
        keyFacts: ["elephant"],
      })
    );
    expect(result.issues.some((i) => i.severity === "error")).toBe(true);
    expect(result.issues.some((i) => i.severity === "warn")).toBe(true);
    expect(result.pass).toBe(false);
  });
});
