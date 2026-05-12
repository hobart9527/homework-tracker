interface FallbackResult {
  success: boolean;
  data: Record<string, unknown>;
  method: string;
}

function tryParseWithFallback(rawText: string): FallbackResult {
  // Strategy 0: Direct parse
  try {
    const text = (rawText || "").trim() || "{}";
    return { success: true, data: JSON.parse(text) as Record<string, unknown>, method: "direct" };
  } catch {
    console.warn("[json-recovery] JSON.parse failed, trying fallback strategy 1");
  }

  // Strategy 1: Remove <think>... blocks
  try {
    const text = rawText
      .replace(/<think[\s\S]*?<\/think>/gi, "")
      .replace(/```(?:json)?\s*([\s\S]*?)```/g, "$1")
      .trim() || "{}";
    return { success: true, data: JSON.parse(text) as Record<string, unknown>, method: "strip-think" };
  } catch {
    console.warn("[json-recovery] Strip <think> failed, trying fallback strategy 2");
  }

  // Strategy 2: Extract first {...} object with regex
  try {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) {
      const text = match[0];
      return { success: true, data: JSON.parse(text) as Record<string, unknown>, method: "regex-extract" };
    }
  } catch {
    console.warn("[json-recovery] Regex extract failed, using fallback");
  }

  // Strategy 3: Return partial object with title (last resort)
  console.warn("[json-recovery] All JSON parse strategies failed, returning partial fallback");
  const titleMatch = rawText.match(/"title"\s*:\s*"([^"]+)"/);
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
