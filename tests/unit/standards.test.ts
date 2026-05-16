import { describe, expect, it } from "vitest";
import {
  getWordCountRange,
  ENGLISH_STANDARDS,
  CHINESE_STANDARDS,
} from "@/lib/reading/standards";

describe("getWordCountRange — English", () => {
  it("returns correct min/max for grade 3", () => {
    const range = getWordCountRange("en", 3);
    expect(range.min).toBe(350);
    expect(range.max).toBe(550);
  });

  it("returns correct min/max for grade 4", () => {
    const range = getWordCountRange("en", 4);
    expect(range.min).toBe(450);
    expect(range.max).toBe(800);
  });

  it("returns correct min/max for grade 5", () => {
    const range = getWordCountRange("en", 5);
    expect(range.min).toBe(600);
    expect(range.max).toBe(1100);
  });

  it("returns correct min/max for grade 6", () => {
    const range = getWordCountRange("en", 6);
    expect(range.min).toBe(700);
    expect(range.max).toBe(1500);
  });

  it("returns correct min/max for grade 7", () => {
    const range = getWordCountRange("en", 7);
    expect(range.min).toBe(900);
    expect(range.max).toBe(1800);
  });

  it("returns correct min/max for grade 8", () => {
    const range = getWordCountRange("en", 8);
    expect(range.min).toBe(1000);
    expect(range.max).toBe(2200);
  });
});

describe("getWordCountRange — Chinese", () => {
  it("returns correct min/max for grade 3", () => {
    const range = getWordCountRange("zh", 3);
    expect(range.min).toBe(200);
    expect(range.max).toBe(600);
  });

  it("returns correct min/max for grade 5", () => {
    const range = getWordCountRange("zh", 5);
    expect(range.min).toBe(400);
    expect(range.max).toBe(1000);
  });

  it("returns correct min/max for grade 8", () => {
    const range = getWordCountRange("zh", 8);
    expect(range.min).toBe(700);
    expect(range.max).toBe(1700);
  });
});

describe("getWordCountRange — boundaries and fallback", () => {
  it("grade 1 returns valid English range (lowest boundary)", () => {
    const range = getWordCountRange("en", 1);
    expect(range).toBeDefined();
    expect(range.min).toBe(ENGLISH_STANDARDS[1].wordCountRange.min);
    expect(range.max).toBe(ENGLISH_STANDARDS[1].wordCountRange.max);
  });

  it("grade 8 returns valid Chinese range (highest boundary)", () => {
    const range = getWordCountRange("zh", 8);
    expect(range).toBeDefined();
    expect(range.min).toBe(CHINESE_STANDARDS[8].charCountRange.min);
    expect(range.max).toBe(CHINESE_STANDARDS[8].charCountRange.max);
  });

  it("invalid grade 0 clamps to grade 1 for English", () => {
    const range = getWordCountRange("en", 0);
    expect(range.min).toBe(ENGLISH_STANDARDS[1].wordCountRange.min);
    expect(range.max).toBe(ENGLISH_STANDARDS[1].wordCountRange.max);
  });

  it("invalid grade 99 clamps to grade 8 for Chinese", () => {
    const range = getWordCountRange("zh", 99);
    expect(range.min).toBe(CHINESE_STANDARDS[8].charCountRange.min);
    expect(range.max).toBe(CHINESE_STANDARDS[8].charCountRange.max);
  });

  it("every returned range satisfies min <= max", () => {
    for (let g = 1; g <= 8; g++) {
      const en = getWordCountRange("en", g);
      const zh = getWordCountRange("zh", g);
      expect(en.min).toBeLessThanOrEqual(en.max);
      expect(zh.min).toBeLessThanOrEqual(zh.max);
    }
  });
});
