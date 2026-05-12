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
    // Character-by-character ruby annotation: 你(nǐ)好(hǎo)
    expect(out).toContain("你(nǐ)");
    expect(out).toContain("好(hǎo)");
    expect(out).toBe("你(nǐ)好(hǎo)");
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
    // Character-by-character: 你(nǐ)好(hǎo)
    expect(out.startsWith("Hello ")).toBe(true);
    expect(out).toContain("你(nǐ)");
    expect(out).toContain("好(hǎo)");
    expect(out.endsWith(" 123")).toBe(true);
  });

  it("keeps Chinese punctuation as non-Chinese passthrough", () => {
    const out = convertToRubyPinyin("你好，世界！");
    // Character-by-character: 你(nǐ)好(hǎo)，世(shì)界(jiè)！
    expect(out).toContain("你(nǐ)");
    expect(out).toContain("好(hǎo)");
    expect(out).toContain("世(shì)");
    expect(out).toContain("界(jiè)");
  });
});
