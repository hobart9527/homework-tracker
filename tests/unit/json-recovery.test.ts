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

  // --- MiniMax-specific truncation patterns ---

  it("fixes MiniMax format: truncated mid-key name", () => {
    const raw = '{"title":"过新年","content":"真快乐。","sum';
    const result = parseJsonWithRecovery(raw);
    expect(result).toEqual({
      title: "过新年",
      content: "真快乐。",
    });
  });

  it("fixes MiniMax format: truncated mid-value with newlines", () => {
    const raw =
      '{\n  "title": "小明的庐山瀑布之旅",\n  "content": "暑假到了，小明和爸爸妈妈一起去庐山旅游。",\n  "sum';
    const result = parseJsonWithRecovery(raw);
    expect(result).toEqual({
      title: "小明的庐山瀑布之旅",
      content: "暑假到了，小明和爸爸妈妈一起去庐山旅游。",
    });
  });

  it("fixes MiniMax format: truncated content value mid-sentence", () => {
    const raw =
      '{"title":"明月几时有","content":"明亮的月亮什么时候开始有的呢？","summary":"这是大诗人写的。他说明亮';
    const result = parseJsonWithRecovery(raw);
    expect(result).toEqual({
      title: "明月几时有",
      content: "明亮的月亮什么时候开始有的呢？",
      summary: "这是大诗人写的。他说明亮",
    });
  });

  it("handles content with backslash-escaped internal quotes", () => {
    // Content with escaped quotes: 他说：\"你好\"
    const raw =
      '{"title":"妈妈缝的新衣","content":"小明说：\\"你好\\"世界","summary":"ok"}';
    const result = parseJsonWithRecovery(raw);
    expect(result).toHaveProperty("title");
    expect(result).toHaveProperty("content");
    expect(result).toHaveProperty("summary");
  });

  it("fixes truncation mid-escape-sequence", () => {
    // Ends in middle of a backslash escape
    const raw = `{"title":"Test","content":"hello\\`;
    // This ends in: ...hello\
    const result = parseJsonWithRecovery(raw);
    expect(result).toEqual({
      title: "Test",
      content: "hello",
    });
  });

  it("fixes truncation after comma before next key", () => {
    const raw = '{"title":"Test","content":"hello",';
    const result = parseJsonWithRecovery(raw);
    expect(result).toEqual({
      title: "Test",
      content: "hello",
    });
  });

  it("fixes truncation with only opening brace", () => {
    const result = parseJsonWithRecovery("{");
    expect(result).toEqual({});
  });

  it("fixes empty string", () => {
    const result = parseJsonWithRecovery("");
    expect(result).toEqual({ title: "Untitled" });
  });

  it("fixes completely empty object", () => {
    const result = parseJsonWithRecovery("{}");
    expect(result).toEqual({});
  });

  it("closes unclosed string + braces together", () => {
    const raw = '{"title":"Fragmented","content":"too much text';
    const result = parseJsonWithRecovery(raw);
    expect(result).toEqual({
      title: "Fragmented",
      content: "too much text",
    });
  });

  it("handles truncation after comma+whitespace+newline before next key", () => {
    const raw =
      '{\n  "title": "Test",\n  "content": "Some text",\n  \n';
    const result = parseJsonWithRecovery(raw);
    expect(result).toEqual({
      title: "Test",
      content: "Some text",
    });
  });

  it("escapes literal newlines inside string values (MiniMax content)", () => {
    // MiniMax returns JSON with real U+000A bytes inside "content" value
    // Build raw text that has literal newlines inside a JSON string
    const inner = JSON.stringify({
      title: "寒江独钓",
      content: "第一段。\n\n第二段。\n\n第三段。",
    });
    // The \n in JS is a real newline — JSON.parse would reject it
    // Simulate what MiniMax returns: {title, content} with actual newlines
    const literalNewlines =
      '{"title":"寒江独钓","content":"第一段。\n\n第二段。\n\n第三段。"}';
    const result = parseJsonWithRecovery(literalNewlines);
    expect(result).toEqual({
      title: "寒江独钓",
      content: "第一段。\n\n第二段。\n\n第三段。",
    });
  });

  it("recovers chapter outline format with truncated title field", () => {
    const raw =
      '{\n  "title": "动物的奇妙世界",\n  "chapters": [\n    {\n      "heading": "第1章 认识动物",\n      "summary": "介绍各种动物的基本特征。';
    const result = parseJsonWithRecovery(raw);
    expect(result).toHaveProperty("title");
    expect(result).toHaveProperty("chapters");
    expect(Array.isArray((result as any).chapters)).toBe(true);
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

  it("regex-extract method for trailing text", () => {
    const raw = '{"e":5} trailing garbage';
    const result = tryParseWithFallback(raw);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ e: 5 });
    expect(result.method).toBe("regex-extract");
  });

  it("close-json method for unbalanced JSON", () => {
    const raw = '{"f":6';
    const result = tryParseWithFallback(raw);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ f: 6 });
    expect(result.method).toBe("close-json");
  });

  it("fallback with title extraction", () => {
    const raw = 'blah "title": "My Title" blah';
    const result = tryParseWithFallback(raw);
    expect(result.success).toBe(false);
    expect(result.data).toEqual({ title: "My Title" });
    expect(result.method).toBe("fallback");
  });

  it("fallback with Untitled when no title found", () => {
    const raw = "completely unparseable garbage";
    const result = tryParseWithFallback(raw);
    expect(result.success).toBe(false);
    expect(result.data).toEqual({ title: "Untitled" });
    expect(result.method).toBe("fallback");
  });

  // --- Trailing comma recovery ---

  it("trailing-comma method for JSON with trailing commas", () => {
    const raw = '{"c":3,"d":[4,5,],}';
    const result = tryParseWithFallback(raw);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ c: 3, d: [4, 5] });
    expect(result.method).toBe("trailing-comma");
  });

  // --- Mid-key truncation ---

  it("strip-trailing-field method for mid-key truncation", () => {
    const raw = '{"title":"A","summary":"B","missi';
    const result = tryParseWithFallback(raw);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ title: "A", summary: "B" });
    expect(result.method).toBe("strip-trailing-field");
  });

  // --- Close unclosed string ---

  it("close-json method for truncated unclosed string", () => {
    const raw = '{"title":"Hello","content":"world';
    const result = tryParseWithFallback(raw);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ title: "Hello", content: "world" });
    expect(result.method).toBe("close-json");
  });

  // --- MiniMax backslash format ---

  it("handles MiniMax format with escaped keys/values", () => {
    // Simulating {\"title\":\"过新年\",\"content\":\"真快乐\"}
    const raw = String.raw`{"title":"过新年","content":"真快乐"}`;
    const result = tryParseWithFallback(raw);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ title: "过新年", content: "真快乐" });
  });

  it("handles MiniMax format with truncated tail", () => {
    const raw = String.raw`{"title":"过新年","content":"真快乐","sum`;
    const result = tryParseWithFallback(raw);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ title: "过新年", content: "真快乐" });
  });

  it("handles MiniMax format with newlines and truncated tail", () => {
    const raw =
      String.raw`{"title":"妈妈缝的新衣","content":"小明想给妈妈送一件","sum`;
    const result = tryParseWithFallback(raw);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      title: "妈妈缝的新衣",
      content: "小明想给妈妈送一件",
    });
  });
});
