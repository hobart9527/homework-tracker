interface FallbackResult {
  success: boolean;
  data: Record<string, unknown>;
  method: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Count unbalanced braces/brackets and track the open-stack order.
 * Used by closeJson to close in the correct nesting order.
 */
function closeJson(text: string): string {
  let braceCount = 0;
  let bracketCount = 0;
  let inString = false;
  let esc = false;
  const openStack: Array<"{" | "["> = [];

  for (const ch of text) {
    if (esc) { esc = false; continue; }
    if (ch === "\\") { esc = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") { braceCount++; openStack.push("{"); }
    if (ch === "}") { braceCount--; openStack.pop(); }
    if (ch === "[") { bracketCount++; openStack.push("["); }
    if (ch === "]") { bracketCount--; openStack.pop(); }
  }

  let fixed = text;
  if (inString) fixed += '"'; // close unclosed string first
  // Close in reverse order of opening — ensures correct nesting
  for (let i = openStack.length - 1; i >= 0; i--) {
    fixed += openStack[i] === "{" ? "}" : "]";
  }
  return fixed;
}

/**
 * Truncate text at the last structural boundary (`}` or `]`), then
 * remove trailing commas and balance braces.  Handles cases where
 * garbage text follows a valid JSON value.
 */
function truncateAndBalance(text: string): string | null {
  const lastBrace = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (lastBrace < 0) return null; // no structural boundary
  let truncated = text.slice(0, lastBrace + 1);
  truncated = truncated
    .replace(/,(\s*[}\]])/g, "$1")
    .replace(/,\s*$/, "");
  const fixed = closeJson(truncated);
  try {
    JSON.parse(fixed);
    return fixed;
  } catch {
    return null;
  }
}

/**
 * Strip incomplete trailing field(s) from a JSON object that was truncated
 * mid-string. Handles patterns like:
 *   ..., "sum           → strip `"sum`, keep {title, content}
 *   ..., "content": "长文  → strip incomplete `content` value
 *   ...,\n  "sum        → whitespace after comma, strip `"sum`
 *
 * Single left-to-right pass tracking brace depth and string state.
 */
function stripIncompleteTrailingField(text: string): string {
  let s = text.trimEnd();
  if (!s) return "{}";

  // Handle orphan backslash at end (mid-escape truncation like "hello\")
  // Only strip when odd count: `\\` is valid (literal backslash), `\` is orphan
  const trailingBackslash = s.match(/(\\+)$/);
  if (trailingBackslash && trailingBackslash[1].length % 2 === 1) {
    s = s.slice(0, -1).trimEnd();
    s += '"'; // close the unclosed string — value is actually complete
  }

  // Detect if we end inside an unclosed string
  let inString = false;
  let esc = false;
  for (const ch of s) {
    if (esc) { esc = false; continue; }
    if (ch === "\\") { esc = true; continue; }
    if (ch === '"') { inString = !inString; }
  }
  if (!inString) return s; // no unclosed string — not our pattern

  // Single-pass: track depth, last `,"` boundary at depth 1,
  // skipping whitespace between comma and quote.
  let depth = 0;
  let lastBoundary = -1;
  let str = false;
  let e = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (e) { e = false; continue; }
    if (c === "\\") { e = true; continue; }
    if (c === '"') { str = !str; continue; }
    if (str) continue;
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (depth === 1 && c === ",") {
      // Skip whitespace after comma looking for opening quote of a field
      let j = i + 1;
      while (j < s.length && (s[j] === " " || s[j] === "\t" || s[j] === "\n" || s[j] === "\r")) j++;
      if (j < s.length && s[j] === '"') {
        lastBoundary = i;
      }
    }
  }

  if (lastBoundary >= 0) {
    // Found the last complete field boundary, truncate there.
    let trimmed = s.slice(0, lastBoundary);
    trimmed = trimmed.replace(/,\s*$/, "").trimEnd();
    return closeJson(trimmed);
  }

  // No `,"` found at depth 1 — remove entire last incomplete value.
  // Find the last complete `"` that closes a depth-1 string-value.
  let d = 0;
  let st = false;
  let es = false;
  let lastCloseQuote = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (es) { es = false; continue; }
    if (c === "\\") { es = true; continue; }
    if (c === '"') {
      if (!st) { st = true; } else {
        st = false;
        if (d === 1) lastCloseQuote = i;
      }
      continue;
    }
    if (st) continue;
    if (c === "{") d++;
    else if (c === "}") d--;
  }

  if (lastCloseQuote >= 0) {
    const fragment = s.slice(0, lastCloseQuote + 1);
    return closeJson(fragment.replace(/,\s*$/, "").trimEnd());
  }

  // Fallback: return empty object
  return "{}";
}

/**
 * Sanitize JSON string values: escape control characters and bare
 * unescaped ASCII `"` inside string values.
 *
 * MiniMax often returns JSON with:
 *   1. Literal newlines (U+000A) in content fields
 *   2. Bare ASCII `"` used as Chinese dialogue quotes
 *      (e.g. 老师说："你好"世界)
 *
 * Both are invalid per JSON spec and cause JSON.parse to throw.
 */
function sanitizeJsonStrings(text: string): string {
  let result = "";
  let inString = false;
  let esc = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (esc) { esc = false; result += ch; continue; }
    if (ch === "\\" && inString) { esc = true; result += ch; continue; }

    if (ch === '"') {
      if (!inString) {
        result += ch;
        inString = true;
        continue;
      }
      // Inside string: check if this quote is structural (closing the value)
      // or content (bare dialogue quote). Look ahead for structural char.
      let j = i + 1;
      while (j < text.length && (text[j] === " " || text[j] === "\t" || text[j] === "\n" || text[j] === "\r")) j++;
      const next = text[j];
      if (next === "," || next === ":" || next === "}" || next === "]" || next === undefined) {
        // Structural delimiter or end of input → closing quote
        inString = false;
        result += ch;
      } else {
        // Content quote (e.g. Chinese dialogue) → escape it
        result += '\\"';
      }
      continue;
    }

    // Control characters inside strings → escape
    if (inString && ch < " ") {
      switch (ch) {
        case "\n": result += "\\n"; break;
        case "\r": result += "\\r"; break;
        case "\t": result += "\\t"; break;
        case "\f": result += "\\f"; break;
        case "\b": result += "\\b"; break;
        default:
          result += `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`;
          break;
      }
    } else {
      result += ch;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main recovery chain
// ---------------------------------------------------------------------------

function tryParseWithFallback(rawText: string): FallbackResult {
  const original = (rawText || "").trim();

  // Strategy 0: Direct parse
  if (!original) {
    // Empty/whitespace-only input — return partial object with title
    return {
      success: true,
      data: { title: "Untitled" } as Record<string, unknown>,
      method: "fallback",
    };
  }
  try {
    return {
      success: true,
      data: JSON.parse(original) as Record<string, unknown>,
      method: "direct",
    };
  } catch {
    console.warn(
      "[json-recovery] JSON.parse failed, trying fallback strategies"
    );
  }

  // Try recovery on the original text
  const fromOriginal = tryParseWithFallbackInner(original);
  if (fromOriginal.success) return fromOriginal;

  // Try recovery on the smart-unescaped text (handles MiniMax backslash format)
  const unescaped = smartUnescape(original);
  if (unescaped) {
    const fromUnescaped = tryParseWithFallbackInner(unescaped);
    if (fromUnescaped.success) return fromUnescaped;
  }

  // Both paths failed — return the original's partial result
  return fromOriginal;
}

/**
 * Smart unescape for MiniMax backslash-escaped format.
 * Only unescapes BACKSLASH+QUOTE in structural positions,
 * preserves content-internal escaped quotes.
 */
function smartUnescape(text: string): string | null {
  if (!text.startsWith('{"')) return null;
  const head = text.slice(0, 100);
  if (!head.includes('\\"')) return null;

  let result = "";
  let inString = false;
  let esc = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === "\\" && !esc) {
      const next = text[i + 1];
      if (next === '"') {
        if (!inString) {
          // Structural backslash — opening quote of a key or value
          result += '"';
          i++;
          esc = false;
          continue;
        }
        const prev = result[result.length - 1] || "";
        if (prev.match(/[{,:\s]/)) {
          result += '"';
          i++;
          esc = false;
          continue;
        }
        // Content-internal — preserve escape
        result += '\\"';
        i++;
        esc = false;
        continue;
      }
      esc = true;
      result += ch;
      continue;
    }

    if (ch === '"' && !esc) {
      inString = !inString;
    }

    esc = false;
    result += ch;
  }

  return result !== text ? result : null;
}

/** Core recovery chain — operates on the given text. */
function tryParseWithFallbackInner(t: string): FallbackResult {
  if (!t) {
    return {
      success: false,
      data: { title: "Untitled" } as Record<string, unknown>,
      method: "fallback",
    };
  }

  // Strategy 1: Strip <think> blocks + markdown fences + leading text
  let text = t
    .replace(/```(?:json)?\s*([\s\S]*?)```/g, "$1")
    .trim();

  text = text.replace(/<think[\s\S]*?<\/think>/gi, "");
  if (text.includes("<think>")) {
    const afterThink = text.split(/<think>/i)[1] || "";
    const firstBrace = afterThink.search(/[{\[]/);
    text = firstBrace >= 0 ? afterThink.slice(firstBrace) : "";
  }
  const jsonStart = text.indexOf("{");
  if (jsonStart > 0) {
    text = text.slice(jsonStart);
  }

  // Sanitize string values: escape control chars + bare quotes
  // Only apply when we have a JSON object structure
  if (text.includes("{") && text.includes("}")) {
    text = sanitizeJsonStrings(text);
  }

  try {
    return {
      success: true,
      data: JSON.parse(text) as Record<string, unknown>,
      method: "strip-think",
    };
  } catch {
    console.warn(
      "[json-recovery] Strip <think> failed, trying strategy 2"
    );
  }

  // Strategy 2: Regex extract first {...} object (use CLEANED text)
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const extracted = match[0];
      return {
        success: true,
        data: JSON.parse(extracted) as Record<string, unknown>,
        method: "regex-extract",
      };
    }
  } catch {
    console.warn(
      "[json-recovery] Regex extract failed, trying strategy 3"
    );
  }

  // Strategy 3: Remove trailing commas
  text = text
    .replace(/,(\s*[}\]])/g, "$1")
    .replace(/,\s*$/, "");
  try {
    return {
      success: true,
      data: JSON.parse(text) as Record<string, unknown>,
      method: "trailing-comma",
    };
  } catch {
    console.warn(
      "[json-recovery] Trailing comma removal failed, trying strategy 4"
    );
  }

  // Strategy 4: Truncate at last `}`/`]`, remove trailing comma, balance braces
  const truncated = truncateAndBalance(text);
  if (truncated) {
    try {
      return {
        success: true,
        data: JSON.parse(truncated) as Record<string, unknown>,
        method: "truncate-balance",
      };
    } catch {
      console.warn(
        "[json-recovery] Truncate-balance parse failed, trying strategy 5"
      );
    }
  }

  // Strategy 5: Close JSON (close string + balance braces)
  try {
    const fixed = closeJson(text);
    return {
      success: true,
      data: JSON.parse(fixed) as Record<string, unknown>,
      method: "close-json",
    };
  } catch {
    console.warn(
      "[json-recovery] Close-JSON failed, trying strategy 6"
    );
  }

  // Strategy 6: Strip incomplete trailing field + close JSON
  try {
    const cleaned = stripIncompleteTrailingField(text);
    const fixed = closeJson(cleaned);
    return {
      success: true,
      data: JSON.parse(fixed) as Record<string, unknown>,
      method: "strip-trailing-field",
    };
  } catch {
    console.warn(
      "[json-recovery] Strip trailing field failed, trying strategy 7"
    );
  }

  // Strategy 7: Last resort — extract title
  console.warn(
    "[json-recovery] All JSON parse strategies failed, returning partial fallback"
  );
  const titleMatch = t.match(/"title"\s*:\s*"([^"]+)"/);
  return {
    success: false,
    data: {
      title: titleMatch ? titleMatch[1] : "Untitled",
    } as Record<string, unknown>,
    method: "fallback",
  };
}

/**
 * Attempts to parse JSON with multiple recovery strategies.
 */
export function parseJsonWithRecovery(raw: string): unknown {
  const result = tryParseWithFallback(raw);
  if (result.success) return result.data;
  const excerpt = raw.substring(Math.max(0, raw.length - 500));
  throw new Error(
    `JSON.parse failed after recovery attempts. Raw length: ${raw.length}. Truncated excerpt: ${excerpt}`
  );
}

export { tryParseWithFallback };
export type { FallbackResult };
