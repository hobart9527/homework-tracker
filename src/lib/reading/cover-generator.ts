/**
 * Cover generator for the reading pipeline.
 *
 * Frozen contract: .planning/reading-pipeline-task-plan.md §3.7
 *
 * Strategy:
 *   1. Build prompt via `buildCoverPrompt(category, scene)`.
 *   2. Atomic quota pre-check via `increment_minimax_quota` RPC.
 *      - true  → consume slot, call MiniMax `image-01`.
 *      - false → quota exhausted, fall back to Pollinations.
 *   3. On MiniMax failure (HTTP non-2xx, network error, missing url) the
 *      slot was already consumed but we do NOT refund — the daily limit
 *      acts as a soft ceiling. Caller falls back to Pollinations.
 *   4. Pollinations failure throws `cover generation failed: <reason>`;
 *      callers (Wave 4 pipeline integration) decide draft/republish.
 *
 * All image bytes are persisted to Supabase Storage `reading-media` bucket
 * via storage-uploader; the returned `url` is the internal Storage URL,
 * with `source_url` retained for audit.
 *
 * Wave 3 step 1 (W3-T1).
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import { downloadAndUploadFromUrl } from "@/lib/reading/storage-uploader";
import { buildCoverPrompt } from "@/lib/reading/cover-style-presets";

export interface GenerateCoverOptions {
  articleId: string;
  language: "zh" | "en";
  category: string;
  /** Single-sentence visual description from `article.scene_description`. */
  scene: string;
  title: string;
}

export interface CoverResult {
  /** Supabase Storage public URL. */
  url: string;
  source: "minimax" | "pollinations";
  /** External CDN URL retained for traceability/audit. */
  source_url: string;
  bytes: number;
}

const MINIMAX_TIMEOUT_MS = 60_000;
const DEFAULT_DAILY_QUOTA = 50;

function todayUtcDate(): string {
  // YYYY-MM-DD; matches the `date` Postgres type used by
  // reading_image_quota_daily.
  return new Date().toISOString().slice(0, 10);
}

function dailyQuotaLimit(): number {
  const raw = process.env.MINIMAX_DAILY_QUOTA;
  if (!raw) return DEFAULT_DAILY_QUOTA;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DAILY_QUOTA;
}

async function checkAndConsumeQuota(): Promise<boolean> {
  const supabase = await createServiceRoleClient();
  const { data, error } = await supabase.rpc("increment_minimax_quota", {
    p_date: todayUtcDate(),
    p_limit: dailyQuotaLimit(),
  });
  if (error) {
    // RPC failure is treated as "quota unavailable" — fall back rather than
    // burn a MiniMax call against a possibly-broken counter.
    console.warn(
      `[cover-generator] quota RPC failed, falling back to Pollinations: ${error.message}`
    );
    return false;
  }
  return data === true;
}

async function generateViaMiniMax(opts: {
  articleId: string;
  positive: string;
  negative: string;
}): Promise<CoverResult> {
  const baseUrl =
    process.env.OPENAI_BASE_URL ?? "https://api.minimaxi.com/v1";
  const apiKey = process.env.OPENAI_API_KEY;
  const endpoint = `${baseUrl}/image_generation`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey ?? ""}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "image-01",
      prompt: opts.positive,
      negative_prompt: opts.negative,
      aspect_ratio: "3:2",
      n: 1,
    }),
    signal: AbortSignal.timeout(MINIMAX_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`minimax http ${response.status}`);
  }

  const data = (await response.json()) as {
    data?: { image_urls?: string[] } | { url?: string }[];
  };

  let externalUrl: string | undefined;
  if (
    data?.data &&
    "image_urls" in data.data &&
    Array.isArray(data.data.image_urls)
  ) {
    externalUrl = data.data.image_urls[0];
  } else if (Array.isArray(data.data) && data.data[0]?.url) {
    externalUrl = data.data[0].url;
  }

  if (!externalUrl) {
    throw new Error("minimax missing url in response");
  }

  const upload = await downloadAndUploadFromUrl({
    externalUrl,
    path: `covers/${opts.articleId}.webp`,
  });

  return {
    url: upload.url,
    source: "minimax",
    source_url: externalUrl,
    bytes: upload.bytes,
  };
}

async function generateViaPollinations(opts: {
  articleId: string;
  positive: string;
}): Promise<CoverResult> {
  const seed = Math.floor(Math.random() * 1_000_000);
  const externalUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(
    opts.positive
  )}?width=800&height=533&seed=${seed}&nologo=true`;

  const upload = await downloadAndUploadFromUrl({
    externalUrl,
    path: `covers/${opts.articleId}.webp`,
  });

  return {
    url: upload.url,
    source: "pollinations",
    source_url: externalUrl,
    bytes: upload.bytes,
  };
}

/**
 * Generate a cover image for a reading article.
 *
 * Throws `cover generation failed: <reason>` if Pollinations also fails
 * (after MiniMax has been skipped or has failed).
 */
export async function generateCover(
  opts: GenerateCoverOptions
): Promise<CoverResult> {
  const { positive, negative } = buildCoverPrompt(opts.category, opts.scene);

  const quotaOk = await checkAndConsumeQuota();
  if (quotaOk) {
    try {
      return await generateViaMiniMax({
        articleId: opts.articleId,
        positive,
        negative,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(
        `[cover-generator] MiniMax failed, falling back to Pollinations: ${reason}`
      );
      // fall through to Pollinations
    }
  }

  try {
    return await generateViaPollinations({
      articleId: opts.articleId,
      positive,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`cover generation failed: ${reason}`);
  }
}
