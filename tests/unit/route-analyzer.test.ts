import { describe, expect, it } from "vitest";
import {
  decideRoute,
  expandGrades,
  type TopicRow,
} from "@/lib/reading/route-analyzer";
import { getWordCountRange } from "@/lib/reading/standards";

function makeTopic(partial: Partial<TopicRow> & { language: "zh" | "en" }): TopicRow {
  return {
    topic_key: "test-topic",
    language: partial.language,
    source: partial.source ?? null,
    source_text: partial.source_text ?? null,
    content_completeness: partial.content_completeness ?? null,
    target_grades: partial.target_grades ?? [partial.language === "en" ? 3 : 5],
    ...partial,
  };
}

describe("decideRoute", () => {
  it("Route A: whitelisted + word count in range + full content", () => {
    const text = "word ".repeat(400).trim();
    const result = decideRoute(
      makeTopic({
        language: "en",
        source: "commonlit",
        source_text: text,
        content_completeness: "full",
        target_grades: [3],
      })
    );
    expect(result.route).toBe("A");
    expect(result.expandedGrades).toContain(3);
    expect(result.reason).toContain("whitelist");
  });

  it("Route A includes grade expansion when word count qualifies", () => {
    const g4min = getWordCountRange("en", 4).min;
    const text = "word ".repeat(Math.ceil(g4min * 0.85) + 1).trim();
    const result = decideRoute(
      makeTopic({
        language: "en",
        source: "commonlit",
        source_text: text,
        content_completeness: "full",
        target_grades: [3],
      })
    );
    expect(result.route).toBe("A");
    expect(result.expandedGrades).toContain(4);
  });

  it("Route B: whitelisted but content incomplete (excerpt)", () => {
    const text = "word ".repeat(300).trim();
    const result = decideRoute(
      makeTopic({
        language: "en",
        source: "commonlit",
        source_text: text,
        content_completeness: "excerpt",
        target_grades: [3],
      })
    );
    expect(result.route).toBe("B");
    expect(result.reason).toBe("content-incomplete");
  });

  it("Route B: whitelisted but word count too high (word mismatch)", () => {
    const text = "word ".repeat(1000).trim();
    const result = decideRoute(
      makeTopic({
        language: "en",
        source: "commonlit",
        source_text: text,
        content_completeness: "full",
        target_grades: [3],
      })
    );
    expect(result.route).toBe("B");
    expect(result.reason).toBe("word-mismatch");
  });

  it("Route C: missing source_text", () => {
    const result = decideRoute(
      makeTopic({
        language: "en",
        source: "commonlit",
        source_text: null,
        target_grades: [3],
      })
    );
    expect(result.route).toBe("C");
    expect(result.reason).toBe("no-source-text");
  });

  it("Route C: source_text too short (<50 chars)", () => {
    const result = decideRoute(
      makeTopic({
        language: "en",
        source: "commonlit",
        source_text: "hi",
        target_grades: [3],
      })
    );
    expect(result.route).toBe("C");
    expect(result.reason).toBe("no-source-text");
  });

  it("Route C: non-whitelisted source", () => {
    const text = "word ".repeat(400).trim();
    const result = decideRoute(
      makeTopic({
        language: "en",
        source: "unknown-source",
        source_text: text,
        target_grades: [3],
      })
    );
    expect(result.route).toBe("C");
    expect(result.reason).toContain("source-not-whitelisted");
  });

  it("Route C: null source defaults to unknown", () => {
    const text = "word ".repeat(400).trim();
    const result = decideRoute(
      makeTopic({
        language: "en",
        source: null,
        source_text: text,
        target_grades: [3],
      })
    );
    expect(result.route).toBe("C");
    expect(result.reason).toContain("source-not-whitelisted:unknown");
  });
});

describe("expandGrades", () => {
  it("en G3 → G4 when word count reaches G4 floor * 0.85", () => {
    const threshold = getWordCountRange("en", 4).min * 0.85;
    const result = expandGrades(Math.ceil(threshold) + 1, 3, "en");
    expect(result).toContain(4);
  });

  it("en G3 does NOT expand when word count is just below threshold", () => {
    const threshold = getWordCountRange("en", 4).min * 0.85;
    const result = expandGrades(Math.floor(threshold), 3, "en");
    expect(result).not.toContain(4);
    expect(result).toEqual([3]);
  });

  it("en G5 → G6 when word count reaches G6 floor * 0.85", () => {
    const threshold = getWordCountRange("en", 6).min * 0.85;
    const result = expandGrades(Math.ceil(threshold) + 1, 5, "en");
    expect(result).toContain(6);
  });

  it("en G6 → G7 when word count reaches G7 floor * 0.85", () => {
    const threshold = getWordCountRange("en", 7).min * 0.85;
    const result = expandGrades(Math.ceil(threshold) + 1, 6, "en");
    expect(result).toContain(7);
  });

  it("en G6 → G7 and G8 when word count reaches G8 floor * 0.85", () => {
    const threshold = getWordCountRange("en", 8).min * 0.85;
    const result = expandGrades(Math.ceil(threshold) + 1, 6, "en");
    expect(result).toContain(7);
    expect(result).toContain(8);
  });

  it("zh baseGrade → baseGrade+1 when char count reaches next grade floor * 0.85", () => {
    const threshold = getWordCountRange("zh", 6).min * 0.85;
    const result = expandGrades(Math.ceil(threshold) + 1, 5, "zh");
    expect(result).toContain(6);
  });

  it("zh does NOT expand when char count is just below threshold", () => {
    const threshold = getWordCountRange("zh", 6).min * 0.85;
    const result = expandGrades(Math.floor(threshold) - 1, 5, "zh");
    expect(result).not.toContain(6);
    expect(result).toEqual([5]);
  });

  it("returns sorted unique grades", () => {
    const result = expandGrades(2000, 6, "en");
    expect(result).toEqual([6, 7, 8]);
  });
});
