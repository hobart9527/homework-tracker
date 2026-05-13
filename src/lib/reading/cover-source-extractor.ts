/**
 * Cover-from-source-image pipeline.
 *
 * Downloads a source website image, validates it, and uploads to
 * Supabase Storage `reading-media` bucket. Used as the primary cover
 * path before falling back to AI generation.
 *
 * Frozen contract: .planning/reading-pipeline-task-plan.md §3.7.1
 */

import { uploadToReadingMedia } from "@/lib/reading/storage-uploader";

export interface CoverFromSourceResult {
  /** Supabase Storage public URL. */
  url: string;
  source: "source-website";
  /** Original source URL retained for traceability/audit. */
  source_url: string;
  bytes: number;
}

function mapContentTypeToExt(contentType: string): string {
  const lower = contentType.toLowerCase();
  if (lower.includes("png")) return "png";
  if (lower.includes("webp")) return "webp";
  if (lower.includes("gif")) return "gif";
  return "jpg";
}

/**
 * Try to generate a cover image from a source website image URL.
 *
 * Returns `null` gracefully on any failure — the caller falls through to
 * AI generation. Never throws.
 */
export async function generateCoverFromSource(
  imageUrl: string,
  articleId: string
): Promise<CoverFromSourceResult | null> {
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
    if (arrayBuffer.byteLength < 1024) return null; // too small — likely garbage

    const ext = mapContentTypeToExt(contentType);
    const path = `covers/${articleId}.${ext}`;

    const upload = await uploadToReadingMedia({
      path,
      bytes: arrayBuffer,
      contentType,
      upsert: true,
    });

    return {
      url: upload.url,
      source: "source-website",
      source_url: imageUrl,
      bytes: upload.bytes,
    };
  } catch {
    // Any error (network, timeout, upload failure) → graceful null so caller
    // falls through to AI generation.
    return null;
  }
}
