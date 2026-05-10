/**
 * Illustration generator for the reading pipeline.
 *
 * Frozen contract: .planning/reading-pipeline-task-plan.md §3.8
 *
 * Strategy:
 *   1. Build prompt via `buildCoverPrompt(category, sceneDescription)`.
 *   2. Generate via Pollinations (free, no quota needed for illustrations).
 *   3. Download and upload to Supabase Storage `reading-media` bucket,
 *      wrapped with exponential-backoff retry to soak up transient 429/5xx.
 *   4. Failure is non-blocking: log a warning and continue to the next scene.
 *   5. Empty scenes → empty array. All scenes fail → empty array (no throw).
 *
 * Wave 3 step 2 (W3-T2). Retry helper added in Wave 1 task wave-1-2; the
 * algorithm is mirrored verbatim from `cover-generator.ts` per the frozen
 * contract — each file inlines its own copy and they MUST NOT cross-import.
 */

import { downloadAndUploadFromUrl } from "@/lib/reading/storage-uploader";
import { buildCoverPrompt } from "@/lib/reading/cover-style-presets";

export interface GenerateIllustrationsOptions {
  articleId: string;
  language: "zh" | "en";
  category: string;
  scenes: { paragraphIndex: number; sceneDescription: string }[];
}

export type IllustrationResult = {
  paragraph_index: number;
  url: string; // Supabase Storage URL
  source_url: string;
  source: "pollinations";
  bytes: number;
}[];

// --- Retry helper (private; not exported) ---------------------------------
//
// Indexed exponential backoff with jitter for the Pollinations download path.
//
// Algorithm (frozen contract, mirrors cover-generator.ts; do NOT cross-import
// — each file inlines its own copy):
//   - attempt counter starts at 1; first call has no pre-wait.
//   - before attempt N (N >= 2):
//       expected = min(baseDelayMs * 2^(N-2), maxDelayMs)
//       actual   = expected * (1 + jitterRatio * (Math.random() - 0.5) * 2)
//   - shouldRetry default: HTTP 429 / 5xx / fetch-network / timeout / Abort.
//   - exhaustion: rethrow the last error.

interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterRatio: number;
  shouldRetry?: (err: unknown) => boolean;
}

function defaultShouldRetry(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (msg.includes("429")) return true;
  // 5xx: match standalone 3-digit codes starting with 5, e.g. "500", "502",
  // "fetch failed: 503". Avoid accidental matches against arbitrary numbers.
  if (/\b5\d{2}\b/.test(msg)) return true;
  if (lower.includes("network")) return true;
  if (lower.includes("fetch failed")) return true;
  if (lower.includes("fetch error")) return true;
  if (lower.includes("timeout")) return true;
  if (lower.includes("aborterror") || lower.includes("abort")) return true;
  return false;
}

function computeBackoffDelayMs(
  attempt: number, // attempt about to start (>= 2 for waits)
  baseDelayMs: number,
  maxDelayMs: number,
  jitterRatio: number,
  random: () => number = Math.random
): number {
  const expected = Math.min(baseDelayMs * 2 ** (attempt - 2), maxDelayMs);
  const actual = expected * (1 + jitterRatio * (random() - 0.5) * 2);
  return Math.max(0, actual);
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  opts: RetryOptions
): Promise<T> {
  const shouldRetry = opts.shouldRetry ?? defaultShouldRetry;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    if (attempt > 1) {
      const delay = computeBackoffDelayMs(
        attempt,
        opts.baseDelayMs,
        opts.maxDelayMs,
        opts.jitterRatio
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt >= opts.maxAttempts || !shouldRetry(err)) {
        throw err;
      }
    }
  }
  // Unreachable in practice (loop either returns or throws), but keeps TS
  // exhaustiveness happy.
  throw lastErr;
}

// Default retry parameters for the Pollinations path. Tests may override the
// base delay via the ILLUSTRATION_RETRY_BASE_DELAY_MS env var to keep CI fast.
function pollinationsRetryOptions(): RetryOptions {
  const baseFromEnv = process.env.ILLUSTRATION_RETRY_BASE_DELAY_MS;
  const parsedBase = baseFromEnv ? parseInt(baseFromEnv, 10) : NaN;
  const baseDelayMs =
    Number.isFinite(parsedBase) && parsedBase >= 0 ? parsedBase : 500;
  return {
    maxAttempts: 4,
    baseDelayMs,
    maxDelayMs: 8000,
    jitterRatio: 0.5,
  };
}

/**
 * Generate paragraph illustrations for a reading article.
 *
 * Only Pollinations is used (no MiniMax quota consumption).
 * Each scene's download/upload is wrapped with exponential-backoff retry to
 * absorb transient 429/5xx; if retries are exhausted the scene is skipped
 * and a warning is logged. Failures are non-blocking; the function never
 * throws.
 */
export async function generateIllustrations(
  opts: GenerateIllustrationsOptions
): Promise<IllustrationResult> {
  if (opts.scenes.length === 0) {
    return [];
  }

  const results: IllustrationResult[number][] = [];
  const retryOpts = pollinationsRetryOptions();

  for (const scene of opts.scenes) {
    try {
      const { positive } = buildCoverPrompt(
        opts.category,
        scene.sceneDescription
      );

      const seed = Math.floor(Math.random() * 1_000_000);
      const externalUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(
        positive
      )}?width=800&height=533&seed=${seed}&nologo=true`;

      const upload = await retryWithBackoff(
        () =>
          downloadAndUploadFromUrl({
            externalUrl,
            path: `illustrations/${opts.articleId}/${scene.paragraphIndex}.webp`,
          }),
        retryOpts
      );

      results.push({
        paragraph_index: scene.paragraphIndex,
        url: upload.url,
        source_url: externalUrl,
        source: "pollinations",
        bytes: upload.bytes,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(
        `[illustration-generator] scene ${scene.paragraphIndex} failed, skipping: ${reason}`
      );
      // continue to next scene — non-blocking
    }
  }

  return results;
}
