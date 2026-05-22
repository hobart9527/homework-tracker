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

import { downloadAndUploadFromUrl, uploadToReadingMedia } from "@/lib/reading/storage-uploader";
import { buildCoverPrompt } from "@/lib/reading/cover-style-presets";

export interface GenerateIllustrationsOptions {
  articleId: string;
  language: "zh" | "en";
  category: string;
  scenes: { paragraphIndex: number; sceneDescription: string }[];
  /** Optional source website image URLs keyed by paragraph index.
   *  When provided, the pipeline tries the corresponding source image
   *  before falling back to Pollinations AI generation. */
  sourceImageUrls?: string[];
}

export type IllustrationResult = {
  paragraph_index: number;
  url: string; // Supabase Storage URL
  source_url: string;
  source: "pollinations" | "source-website" | "dalle";
  bytes: number;
}[];

// --- Image dimension parser (pure-JS, no external deps) -----------------------

/** Parse image dimensions from raw bytes without external libs.
 *  Supports PNG, JPEG (SOF0/SOF2), WebP (VP8 / VP8L), GIF.
 *  Returns null for unknown formats or parsing failure. */
function parseImageDimensions(bytes: ArrayBuffer): { width: number; height: number } | null {
  const view = new DataView(bytes);
  const len = bytes.byteLength;
  if (len < 24) return null;
  const u8 = new Uint8Array(bytes);

  // PNG: 0x89 0x50 0x4E 0x47
  if (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4E && u8[3] === 0x47) {
    if (len < 24) return null;
    return {
      width: view.getUint32(16, false),
      height: view.getUint32(20, false),
    };
  }

  // JPEG: scan for SOF0 (0xFF 0xC0) or SOF2 (0xFF 0xC2)
  for (let i = 0; i < len - 4; i++) {
    if ((u8[i] === 0xFF && u8[i + 1] === 0xC0) || (u8[i] === 0xFF && u8[i + 1] === 0xC2)) {
      if (i + 7 >= len) return null;
      return {
        height: view.getUint16(i + 5, false),
        width: view.getUint16(i + 7, false),
      };
    }
  }

  // WebP: starts with RIFF
  if (u8[0] === 0x52 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x46) {
    const webpTag = String.fromCharCode(u8[8], u8[9], u8[10], u8[11]);
    if (webpTag !== "WEBP") return null;
    const chunkTag = String.fromCharCode(u8[12], u8[13], u8[14], u8[15]);
    if (chunkTag === "VP8 " && len >= 28) {
      return {
        width: view.getUint16(24, true) & 0x3FFF,
        height: view.getUint16(26, true) & 0x3FFF,
      };
    }
    if (chunkTag === "VP8L" && len >= 25) {
      const val = view.getUint32(21, true);
      return {
        width: (val & 0x3FFF) + 1,
        height: ((val >> 14) & 0x3FFF) + 1,
      };
    }
    return null;
  }

  // GIF: starts with GIF87a or GIF89a
  const gifTag = String.fromCharCode(u8[0], u8[1], u8[2]);
  if (gifTag === "GIF" && (u8[3] === 0x38) && ((u8[4] === 0x37 && u8[5] === 0x61) || (u8[4] === 0x39 && u8[5] === 0x61))) {
    if (len < 10) return null;
    return {
      width: view.getUint16(6, true),
      height: view.getUint16(8, true),
    };
  }

  return null;
}

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
 * Try to download and upload a source image for one paragraph index.
 * Returns the result on success, null on any failure. Never throws.
 */
async function trySourceImage(
  imageUrl: string,
  articleId: string,
  paragraphIndex: number
): Promise<IllustrationResult[number] | null> {
  try {
    const response = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; HomeworkTracker/1.0)",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return null;

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength < 1024) return null;

    const dims = parseImageDimensions(arrayBuffer);
    if (!dims || dims.width < 300 || dims.height < 200) return null;

    const lower = contentType.toLowerCase();
    const ext = lower.includes("png") ? "png"
      : lower.includes("webp") ? "webp"
      : lower.includes("gif") ? "gif"
      : "jpg";
    const path = `illustrations/${articleId}/${paragraphIndex}.${ext}`;

    const upload = await uploadToReadingMedia({
      path,
      bytes: arrayBuffer,
      contentType,
      upsert: true,
    });

    return {
      paragraph_index: paragraphIndex,
      url: upload.url,
      source_url: imageUrl,
      source: "source-website",
      bytes: upload.bytes,
    };
  } catch {
    return null;
  }
}

/**
 * Try to generate illustration via DALL-E 3 (opt-in, requires DALLE_API_KEY
 * or OPENAI_API_KEY env var). Returns null if key is missing or API fails.
 * Caller overrides paragraph_index on the returned result.
 */
async function generateViaDalle(opts: {
  articleId: string;
  positive: string;
}): Promise<IllustrationResult[number] | null> {
  const apiKey = process.env.DALLE_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  try {
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey, baseURL: "https://api.openai.com/v1" });
    const response = await client.images.generate({
      model: "dall-e-3",
      prompt: opts.positive,
      n: 1,
      size: "1024x1024",
      response_format: "url",
    });
    const externalUrl = response.data?.[0]?.url;
    if (!externalUrl) return null;
    const upload = await downloadAndUploadFromUrl({
      externalUrl,
      path: `illustrations/${opts.articleId}.webp`,
    });
    return {
      paragraph_index: 0, // caller will override
      url: upload.url,
      source_url: externalUrl,
      source: "dalle" as const,
      bytes: upload.bytes,
    };
  } catch {
    return null;
  }
}

/**
 * Generate paragraph illustrations for a reading article.
 *
 * Source-image-first: when `opts.sourceImageUrls` is provided, each paragraph
 * tries its corresponding source image (by array index) before falling back
 * to Pollinations AI generation.
 *
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
    const idx = scene.paragraphIndex;

    // Source-image-first path
    const sourceUrl = opts.sourceImageUrls?.[idx];
    if (sourceUrl) {
      try {
        const sourceResult = await trySourceImage(
          sourceUrl,
          opts.articleId,
          idx
        );
        if (sourceResult) {
          results.push(sourceResult);
          continue;
        }
        // fall through to AI generation
      } catch {
        // fall through to AI generation
      }
    }

    try {
      const { positive } = buildCoverPrompt(
        opts.category,
        scene.sceneDescription
      );

      // DALL-E fallback (opt-in)
      const dalleResult = await generateViaDalle({
        articleId: opts.articleId,
        positive,
      });
      if (dalleResult) {
        results.push({ ...dalleResult, paragraph_index: idx });
        continue;
      }

      const seed = Math.floor(Math.random() * 1_000_000);
      const externalUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(
        positive
      )}?width=800&height=533&seed=${seed}&nologo=true`;

      const upload = await retryWithBackoff(
        () =>
          downloadAndUploadFromUrl({
            externalUrl,
            path: `illustrations/${opts.articleId}/${idx}.webp`,
          }),
        retryOpts
      );

      results.push({
        paragraph_index: idx,
        url: upload.url,
        source_url: externalUrl,
        source: "pollinations",
        bytes: upload.bytes,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(
        `[illustration-generator] scene ${idx} failed, skipping: ${reason}`
      );
      // continue to next scene — non-blocking
    }
  }

  return results;
}
