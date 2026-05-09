/**
 * Illustration generator for the reading pipeline.
 *
 * Frozen contract: .planning/reading-pipeline-task-plan.md §3.8
 *
 * Strategy:
 *   1. Build prompt via `buildCoverPrompt(category, sceneDescription)`.
 *   2. Generate via Pollinations (free, no quota needed for illustrations).
 *   3. Download and upload to Supabase Storage `reading-media` bucket.
 *   4. Failure is non-blocking: log a warning and continue to the next scene.
 *   5. Empty scenes → empty array. All scenes fail → empty array (no throw).
 *
 * Wave 3 step 2 (W3-T2).
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

/**
 * Generate paragraph illustrations for a reading article.
 *
 * Only Pollinations is used (no MiniMax quota consumption).
 * Failures are logged and skipped; the function never throws.
 */
export async function generateIllustrations(
  opts: GenerateIllustrationsOptions
): Promise<IllustrationResult> {
  if (opts.scenes.length === 0) {
    return [];
  }

  const results: IllustrationResult[number][] = [];

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

      const upload = await downloadAndUploadFromUrl({
        externalUrl,
        path: `illustrations/${opts.articleId}/${scene.paragraphIndex}.webp`,
      });

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
