import { describe, it, expect } from "vitest";
import {
  calculateObjectiveDifficulty,
  __internals,
} from "@/lib/reading/difficulty";

describe("calculateObjectiveDifficulty - English", () => {
  it("rates simple short sentences as easy (1-2)", () => {
    const result = calculateObjectiveDifficulty({
      content: "The cat sat. The dog ran. We can go.",
      language: "en",
      gradeLevel: 1,
    });
    expect(result.difficulty).toBeGreaterThanOrEqual(1);
    expect(result.difficulty).toBeLessThanOrEqual(2);
    expect(result.indicators.flesch_kincaid_grade).toBeDefined();
    expect(result.indicators.avg_words_per_sentence).toBeGreaterThan(0);
    expect(result.indicators.avg_syllables_per_word).toBeGreaterThan(0);
  });

  it("rates a dense scientific paragraph as harder (3-5)", () => {
    const complex = [
      "Photosynthesis is a complicated biochemical process by which terrestrial vegetation converts solar radiation into chemical energy.",
      "During this multifaceted procedure, chlorophyll molecules absorb particular wavelengths of light and subsequently catalyze the transformation of carbon dioxide and water into glucose.",
      "Furthermore, the resulting molecular oxygen is released into the surrounding atmosphere, sustaining innumerable organisms that depend upon aerobic respiration.",
      "Researchers continually investigate the underlying enzymatic mechanisms, hoping to engineer crops that demonstrate improved photosynthetic efficiency under environmental stress.",
      "Such advancements may eventually contribute to global food security amidst accelerating climate variability.",
    ].join(" ");

    const result = calculateObjectiveDifficulty({
      content: complex,
      language: "en",
      gradeLevel: 6,
    });
    expect(result.difficulty).toBeGreaterThanOrEqual(3);
    expect(result.difficulty).toBeLessThanOrEqual(5);
    expect(result.indicators.flesch_kincaid_grade).toBeGreaterThan(7);
  });
});

describe("calculateObjectiveDifficulty - Chinese", () => {
  it("rates short colloquial sentences as easy (1)", () => {
    const result = calculateObjectiveDifficulty({
      content: "我喜欢苹果。妈妈做饭。爸爸看书。",
      language: "zh",
      gradeLevel: 1,
    });
    expect(result.difficulty).toBe(1);
    expect(result.indicators.avg_chars_per_sentence).toBeLessThanOrEqual(8);
  });

  it("rates long argumentative sentences as hard (4-5)", () => {
    const long = [
      "在当今高速发展的现代社会之中人们普遍面临着前所未有的复杂挑战与多重压力的相互交织影响并不断寻求突破。",
      "教育工作者必须深入研究儿童心理发展规律并结合具体教学实践设计出更加科学合理且富有创造性的课程体系方案。",
      "国家长期以来高度重视基础研究领域的持续投入希望通过原创性突破带动整个产业链的全面升级与转型发展。",
    ].join("");
    const result = calculateObjectiveDifficulty({
      content: long,
      language: "zh",
      gradeLevel: 8,
    });
    expect(result.difficulty).toBeGreaterThanOrEqual(4);
    expect(result.difficulty).toBeLessThanOrEqual(5);
    expect(result.indicators.avg_chars_per_sentence).toBeGreaterThan(22);
  });
});

describe("calculateObjectiveDifficulty - mismatch detection", () => {
  it("flags mismatch when LLM rates 5 on a trivially simple text", () => {
    const result = calculateObjectiveDifficulty({
      content: "The cat sat. The dog ran.",
      language: "en",
      gradeLevel: 1,
      llmDifficulty: 5,
    });
    expect(result.mismatch_with_llm).toBe(true);
    expect(result.mismatch_reason).toBeTruthy();
    expect(result.mismatch_reason).toMatch(/LLM rated 5/);
  });

  it("does not flag mismatch when ratings are within 1", () => {
    const result = calculateObjectiveDifficulty({
      content: "The cat sat. The dog ran. We can go home today.",
      language: "en",
      gradeLevel: 1,
      llmDifficulty: 2,
    });
    expect(result.mismatch_with_llm).toBe(false);
    expect(result.mismatch_reason).toBeUndefined();
  });
});

describe("calculateObjectiveDifficulty - edge cases", () => {
  it("returns difficulty 1 and does not crash on empty input", () => {
    const result = calculateObjectiveDifficulty({
      content: "",
      language: "en",
      gradeLevel: 1,
    });
    expect(result.difficulty).toBe(1);
    expect(result.mismatch_with_llm).toBe(false);
  });

  it("returns difficulty 1 on whitespace-only Chinese input", () => {
    const result = calculateObjectiveDifficulty({
      content: "    \n\t  ",
      language: "zh",
      gradeLevel: 1,
    });
    expect(result.difficulty).toBe(1);
  });

  it("flags mismatch when LLM rates 5 on empty content", () => {
    const result = calculateObjectiveDifficulty({
      content: "",
      language: "en",
      gradeLevel: 1,
      llmDifficulty: 5,
    });
    expect(result.mismatch_with_llm).toBe(true);
    expect(result.mismatch_reason).toMatch(/empty/);
  });
});

describe("countSyllables heuristic", () => {
  it("handles common English words", () => {
    expect(__internals.countSyllables("cat")).toBe(1);
    expect(__internals.countSyllables("apple")).toBe(2);
    expect(__internals.countSyllables("photosynthesis")).toBeGreaterThanOrEqual(4);
    expect(__internals.countSyllables("the")).toBe(1);
    expect(__internals.countSyllables("")).toBe(0);
  });
});
