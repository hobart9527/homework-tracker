import { describe, expect, it, vi } from "vitest";
import {
  parseJsonWithRecovery,
  tryParseWithFallback,
} from "@/lib/reading/json-recovery";

describe("parseJsonWithRecovery", () => {
  it("parses clean JSON directly", () => {
    const data = { title: "Clean", value: 42 };
    const result = parseJsonWithRecovery(JSON.stringify(data));
    expect(result).toEqual(data);
  });

  it("strips ```json fences and parses", () => {
    const inner = JSON.stringify({ title: "Fenced", body: "text" });
    const fenced = "```json\n" + inner + "\n```";
    const result = parseJsonWithRecovery(fenced);
    expect(result).toEqual({ title: "Fenced", body: "text" });
  });

  it("strips <think> blocks and parses", () => {
    const inner = JSON.stringify({ title: "AfterThink", ok: true });
    const wrapped = "<think>let me think</think>" + inner;
    const result = parseJsonWithRecovery(wrapped);
    expect(result).toEqual({ title: "AfterThink", ok: true });
  });

  it("handles both fences and think blocks together", () => {
    const inner = JSON.stringify({ title: "Combined", count: 3 });
    const wrapped =
      "<think>reasoning...</think>\n```json\n" + inner + "\n```";
    const result = parseJsonWithRecovery(wrapped);
    expect(result).toEqual({ title: "Combined", count: 3 });
  });

  it("extracts embedded JSON object with regex when extra text surrounds it", () => {
    const embedded = '{"title":"Embedded","value":7}';
    const wrapped = "Some intro text\n" + embedded + "\nSome outro text.";
    const result = parseJsonWithRecovery(wrapped);
    expect(result).toEqual({ title: "Embedded", value: 7 });
  });

  it("throws when unparseable even if a title field is present", () => {
    const raw = 'not json but <think></think> and "title": "Partial Title" here';
    expect(() => parseJsonWithRecovery(raw)).toThrow(
      "JSON.parse failed after recovery attempts"
    );
  });

  it("throws when all recovery strategies fail and no title found", () => {
    expect(() => parseJsonWithRecovery("totally not json")).toThrow(
      "JSON.parse failed after recovery attempts"
    );
  });

  // --- Content-generator-level recovery tests ---

  it("fixes trailing commas before ] or }", () => {
    const raw = '{"title":"Trailing","items":[1,2,3,],"ok":true,}';
    const result = parseJsonWithRecovery(raw);
    expect(result).toEqual({ title: "Trailing", items: [1, 2, 3], ok: true });
  });

  it("fixes trailing comma inside nested objects", () => {
    const raw = '{"a":{"b":1,},"c":2,}';
    const result = parseJsonWithRecovery(raw);
    expect(result).toEqual({ a: { b: 1 }, c: 2 });
  });

  it("truncates after last structural brace when trailing text exists", () => {
    const raw = '{"title":"Truncated","value":42} some trailing text';
    const result = parseJsonWithRecovery(raw);
    expect(result).toEqual({ title: "Truncated", value: 42 });
  });

  it("closes unbalanced braces", () => {
    const raw = '{"title":"Unbalanced","items":[1,2,3';
    const result = parseJsonWithRecovery(raw);
    expect(result).toEqual({ title: "Unbalanced", items: [1, 2, 3] });
  });

  it("closes unbalanced braces and brackets together", () => {
    const raw = '{"title":"Mixed","nested":{"a":1';
    const result = parseJsonWithRecovery(raw);
    expect(result).toEqual({ title: "Mixed", nested: { a: 1 } });
  });

  it("handles markdown fence + trailing comma + unbalanced braces", () => {
    const raw = '```json\n{"title":"Complex","tags":["a","b",],\n```';
    const result = parseJsonWithRecovery(raw);
    expect(result).toEqual({ title: "Complex", tags: ["a", "b"] });
  });

  it("handles <think> + markdown fence + truncated JSON", () => {
    const raw =
      '<think>reasoning...</think>\n```json\n{"title":"AllFixes","data":[1,2,3,],\n```\nextra text';
    const result = parseJsonWithRecovery(raw);
    expect(result).toEqual({ title: "AllFixes", data: [1, 2, 3] });
  });
});

describe("tryParseWithFallback", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns direct method for clean JSON", () => {
    const raw = JSON.stringify({ a: 1 });
    const result = tryParseWithFallback(raw);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ a: 1 });
    expect(result.method).toBe("direct");
  });

  it("returns strip-think method for think-wrapped JSON", () => {
    const raw = "<think>...</think>" + JSON.stringify({ b: 2 });
    const result = tryParseWithFallback(raw);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ b: 2 });
    expect(result.method).toBe("strip-think");
  });

  it("returns trailing-comma method for JSON with trailing commas", () => {
    const raw = '{"c":3,"d":[4,5,],}';
    const result = tryParseWithFallback(raw);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ c: 3, d: [4, 5] });
    expect(result.method).toBe("trailing-comma");
  });

  it("returns regex-extract method when trailing text exists", () => {
    const raw = '{"e":5} trailing garbage';
    const result = tryParseWithFallback(raw);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ e: 5 });
    expect(result.method).toBe("regex-extract");
  });

  it("returns balance-braces method for unbalanced JSON", () => {
    const raw = '{"f":6';
    const result = tryParseWithFallback(raw);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ f: 6 });
    expect(result.method).toBe("balance-braces");
  });

  it("returns regex-extract method for embedded object", () => {
    const raw = "prefix {\"g\":7} suffix";
    const result = tryParseWithFallback(raw);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ g: 7 });
    expect(result.method).toBe("regex-extract");
  });

  it("returns fallback method with extracted title when unparseable", () => {
    const raw = 'blah "title": "My Title" blah';
    const result = tryParseWithFallback(raw);
    expect(result.success).toBe(false);
    expect(result.data).toEqual({ title: "My Title" });
    expect(result.method).toBe("fallback");
  });

  it("returns fallback method with Untitled when no title found", () => {
    const raw = "completely unparseable garbage";
    const result = tryParseWithFallback(raw);
    expect(result.success).toBe(false);
    expect(result.data).toEqual({ title: "Untitled" });
    expect(result.method).toBe("fallback");
  });
});
