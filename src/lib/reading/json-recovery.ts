/**
 * JSON parsing utility with recovery for truncated LLM responses.
 * Attempts direct parse first, then falls back to truncated version with balanced braces.
 */

/**
 * Attempts to parse JSON with multiple recovery strategies:
 * 1. Direct parse after stripping markdown fences and think blocks
 * 2. Truncated parse using last complete balanced braces
 * 3. Descriptive error on total failure
 */
export function parseJsonWithRecovery(raw: string): unknown {
  // Strip markdown fences and think blocks
  const cleaned = raw
    .replace(/<think[\s\S]*?<\/think>/gi, "")
    .replace(/```(?:json)?\s*([\s\S]*?)```/g, "$1")
    .trim();

  // Strategy 1: Try direct parse
  try {
    return JSON.parse(cleaned);
  } catch {
    // Strategy 1 failed, continue to recovery
  }

  // Strategy 2: Find last complete balanced braces and parse that
  let truncated = cleaned;
  let depth = 0;
  let lastCompletePos = -1;

  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i] === "{") {
      depth++;
    } else if (cleaned[i] === "}") {
      depth--;
      if (depth === 0) {
        lastCompletePos = i;
      }
    }
  }

  if (lastCompletePos >= 0) {
    truncated = cleaned.substring(0, lastCompletePos + 1);
    console.log(`[json-recovery] Truncated at position ${lastCompletePos + 1}/${cleaned.length}`);
    console.log(`[json-recovery] Excerpt: ${truncated.substring(Math.max(0, truncated.length - 500))}`);

    try {
      return JSON.parse(truncated);
    } catch {
      // Truncated also failed, fall through to error
    }
  }

  // Strategy 3: Give up with descriptive error
  const excerpt = raw.substring(Math.max(0, raw.length - 500));
  throw new Error(
    `JSON.parse failed after recovery attempts. Raw length: ${raw.length}. ` +
    `Truncated excerpt: ${excerpt}`
  );
}
