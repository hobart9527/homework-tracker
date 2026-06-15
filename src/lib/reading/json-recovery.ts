interface FallbackResult {
  success: boolean;
  data: Record<string, unknown>;
  method: string;
}

/**
 * Strip incomplete trailing field(s) from a JSON object that was truncated
 * mid-string. Handles patterns like:
 *   ...,\"sum           → strip `\"sum`, keep {title, content}
 *   ...,\"content\":\"长文  → strip incomplete `content` value
 *   ...,\"content\":\"他说：\\\"你好\\\"世界\",\"sum  → strip `\"sum`, keep {title, content}
 *
 * Uses a single left-to-right pass tracking brace depth and string state
 * to identify the last complete `,"` field boundary at depth 1.
 */
function stripIncompleteTrailingField(text: string): string {
  const s = text.trimEnd();
  if (!s) return text;

  // Detect if we end inside an unclosed string
  let inString = false;
  let esc = false;
  for (const ch of s) {
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inString = !inString; }
  }
  if (!inString) return s; // no unclosed string — not our pattern

  // Single-pass: track depth, last `,"` boundary at depth 1
  let depth = 0;
  let lastBoundary = -1;
  let str = false;
  let e = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (e) { e = false; continue; }
    if (c === '\\') { e = true; continue; }
    if (c === '"') { str = !str; continue; }
    if (str) continue;
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (depth === 1 && c === ',' && i + 1 < s.length && s[i + 1] === '"') {
      lastBoundary = i;
    }
  }

  if (lastBoundary >= 0) {
    return s.slice(0, lastBoundary).replace(/,\s*$/, "").trimEnd();
  }
  // No `,"` found at depth 1 — remove entire last incomplete value.
  // Find the last complete `"` that closes a depth-1 value.
  let d = 0;
  let st = false;
  let es = false;
  let lastCloseQuote = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (es) { es = false; continue; }
    if (c === '\\') { es = true; continue; }
    if (c === '"') {
      if (!st) { st = true; } else {
        st = false;
        // This `"` closes a string. At depth 1, it closes a value.
        if (d === 1) lastCloseQuote = i;
      }
      continue;
    }
    if (st) continue;
    if (c === '{') d++;
    else if (c === '}') d--;
  }

  if (lastCloseQuote >= 0) {
    // Truncate after the last close-quote (it may be followed by `,"` or by end)
    const fragment = s.slice(0, lastCloseQuote + 1);
    return fragment.replace(/,\s*$/, "").trimEnd();
  }
  return s.slice(0, 1); // keep opening brace
}

function tryParseWithFallback(rawText: string): FallbackResult {
  const original = (rawText || "").trim();

  // Strategy 0: Direct parse
  try {
    const text = original || "{}";
    return { success: true, data: JSON.parse(text) as Record<string, unknown>, method: "direct" };
  } catch {
    console.warn("[json-recovery] JSON.parse failed, trying fallback strategy 1");
  }

  // Strategy 1: Strip <think> blocks (closed + unclosed) + markdown fences
  // Handle both: <think>...</think>{JSON}  and  <think>...{JSON} (unclosed)
  let text = original
    .replace(/```(?:json)?\s*([\s\S]*?)```/g, "$1")
    .trim();

  // Remove <think> blocks: first try closed, then handle unclosed by finding JSON after
  text = text.replace(/<think[\s\S]*?<\/think>/gi, "");
  if (text.includes("<think>")) {
    // Unclosed <think>: find the first { or [ after <think>, that's where JSON starts
    const afterThink = text.split(/<think>/i)[1] || "";
    const firstBrace = afterThink.search(/[{\[]/);
    if (firstBrace >= 0) {
      text = afterThink.slice(firstBrace);
    } else {
      text = "";
    }
  }
  // If there's plain text before the JSON object, find the first '{'
  const firstBrace = text.indexOf("{");
  if (firstBrace > 0) {
    text = text.slice(firstBrace);
  }
  try {
    return { success: true, data: JSON.parse(text) as Record<string, unknown>, method: "strip-think" };
  } catch {
    console.warn("[json-recovery] Strip <think> failed, trying fallback strategy 2");
  }

  // Strategy 3: Regex extract first {...} object (original strategy 2)
  try {
    const match = original.match(/\{[\s\S]*\}/);
    if (match) {
      const extracted = match[0];
      return { success: true, data: JSON.parse(extracted) as Record<string, unknown>, method: "regex-extract" };
    }
  } catch {
    console.warn("[json-recovery] Regex extract failed, trying fallback strategy 3");
  }

  // Strategy 4: Remove trailing commas before ] or } and at end of string
  text = text.replace(/,(\s*[}\]])/g, "$1").replace(/,\s*$/, "");
  try {
    return { success: true, data: JSON.parse(text) as Record<string, unknown>, method: "trailing-comma" };
  } catch {
    console.warn("[json-recovery] Trailing comma removal failed, trying fallback strategy 4");
  }

  // Strategy 5: Truncate after last structural brace, then balance braces on truncated text
  const lastBrace = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (lastBrace > 0) {
    let truncated = text.slice(0, lastBrace + 1);
    truncated = truncated.replace(/,(\s*[}\]])/g, "$1").replace(/,\s*$/, "");
    try {
      return { success: true, data: JSON.parse(truncated) as Record<string, unknown>, method: "truncate" };
    } catch {
      console.warn("[json-recovery] Truncate failed, trying fallback strategy 4");
    }

    // Strategy 4: Count and close unbalanced braces/brackets on truncated text
    let braceCount = 0;
    let bracketCount = 0;
    let inString = false;
    let escaped = false;
    for (const ch of truncated) {
      if (escaped) { escaped = false; continue; }
      if (ch === "\\") { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === "{") braceCount++;
      if (ch === "}") braceCount--;
      if (ch === "[") bracketCount++;
      if (ch === "]") bracketCount--;
    }
    const fixed = truncated + "]".repeat(Math.max(0, bracketCount)) + "}".repeat(Math.max(0, braceCount));
    try {
      return { success: true, data: JSON.parse(fixed) as Record<string, unknown>, method: "balance-braces" };
    } catch {
      console.warn("[json-recovery] Brace balancing failed, trying fallback strategy 5");
    }
  } else {
    // Strategy 4 (alt): Balance braces on full text when no structural brace found
    let braceCount = 0;
    let bracketCount = 0;
    let inString = false;
    let escaped = false;
    for (const ch of text) {
      if (escaped) { escaped = false; continue; }
      if (ch === "\\") { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === "{") braceCount++;
      if (ch === "}") braceCount--;
      if (ch === "[") bracketCount++;
      if (ch === "]") bracketCount--;
    }
    const fixed = text + "]".repeat(Math.max(0, bracketCount)) + "}".repeat(Math.max(0, braceCount));
    try {
      return { success: true, data: JSON.parse(fixed) as Record<string, unknown>, method: "balance-braces" };
    } catch {
      console.warn("[json-recovery] Brace balancing failed, trying fallback strategy 5");
    }
  }

  // Strategy 5b: Strip incomplete trailing field + balance braces
  // Handles truncation mid-value or mid-key: "...",\"sum → strip `"sum` then balance
  try {
    let cleaned = stripIncompleteTrailingField(text);
    let braceCount = 0;
    let bracketCount = 0;
    let inString = false;
    let escaped = false;
    for (const ch of cleaned) {
      if (escaped) { escaped = false; continue; }
      if (ch === "\\") { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === "{") braceCount++;
      if (ch === "}") braceCount--;
      if (ch === "[") bracketCount++;
      if (ch === "]") bracketCount--;
    }
    const fixed = cleaned + "]".repeat(Math.max(0, bracketCount)) + "}".repeat(Math.max(0, braceCount));
    return { success: true, data: JSON.parse(fixed) as Record<string, unknown>, method: "strip-trailing-field" };
  } catch {
    console.warn("[json-recovery] Strip trailing field failed, trying fallback strategy 6");
  }

  // Strategy 6: Return partial object with title (last resort)
  console.warn("[json-recovery] All JSON parse strategies failed, returning partial fallback");
  const titleMatch = original.match(/"title"\s*:\s*"([^"]+)"/);
  return {
    success: false,
    data: { title: titleMatch ? titleMatch[1] : "Untitled" } as Record<string, unknown>,
    method: "fallback",
  };
}

/**
 * Attempts to parse JSON with multiple recovery strategies.
 * Delegates to the canonical tryParseWithFallback() implementation.
 */
export function parseJsonWithRecovery(raw: string): unknown {
  const result = tryParseWithFallback(raw);
  if (result.success) return result.data;
  // For backward compat: old callers expect throw on failure
  const excerpt = raw.substring(Math.max(0, raw.length - 500));
  throw new Error(
    `JSON.parse failed after recovery attempts. Raw length: ${raw.length}. Truncated excerpt: ${excerpt}`
  );
}

export { tryParseWithFallback };
export type { FallbackResult };
