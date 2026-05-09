import { describe, it, expect } from "vitest";
import { convertToRubyPinyin } from "@/lib/reading/pinyin-converter";

describe("convertToRubyPinyin", () => {
  it("returns empty string for empty input", () => {
    expect(convertToRubyPinyin("")).toBe("");
  });

  it("passes through pure ASCII text unchanged", () => {
    expect(convertToRubyPinyin("Hello, world! 123")).toBe("Hello, world! 123");
  });

  it("converts a simple Chinese phrase with pinyin in parentheses", () => {
    const out = convertToRubyPinyin("你好");
    // pinyin-pro's word-aware segmentation should produce a single run with
    // both syllables, e.g. "你好(nǐ hǎo)". We accept either single-character
    // or word-level grouping but require correct tones.
    expect(out.startsWith("你好(")).toBe(true);
    expect(out).toContain("nǐ");
    expect(out).toContain("hǎo");
    expect(out.endsWith(")")).toBe(true);
  });

  it("handles polyphonic 银行 vs 行走 correctly", () => {
    const yinhang = convertToRubyPinyin("银行");
    expect(yinhang).toContain("yín");
    expect(yinhang).toContain("háng");

    const xingzou = convertToRubyPinyin("行走");
    expect(xingzou).toContain("xíng");
    expect(xingzou).toContain("zǒu");
  });

  it("handles polyphonic 重要 vs 重新 correctly", () => {
    const zhongyao = convertToRubyPinyin("重要");
    expect(zhongyao).toContain("zhòng");
    expect(zhongyao).toContain("yào");

    const chongxin = convertToRubyPinyin("重新");
    expect(chongxin).toContain("chóng");
    expect(chongxin).toContain("xīn");
  });

  it("preserves non-Chinese characters around Chinese runs", () => {
    const out = convertToRubyPinyin("Hello 你好 123");
    // The English / digit / whitespace / punctuation portions stay intact.
    expect(out.startsWith("Hello ")).toBe(true);
    expect(out).toContain("你好(");
    expect(out.endsWith(" 123")).toBe(true);
    expect(out).toContain("nǐ");
    expect(out).toContain("hǎo");
  });

  it("keeps Chinese punctuation as non-Chinese passthrough", () => {
    const out = convertToRubyPinyin("你好，世界！");
    // Punctuation 「，」「！」 are not in the CJK ideograph range, so they
    // sit between Chinese runs and remain untouched.
    expect(out).toContain("，");
    expect(out).toContain("！");
    expect(out).toContain("你好(");
    expect(out).toContain("世界(");
  });
});
