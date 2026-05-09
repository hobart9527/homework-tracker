/**
 * Reading media storage uploader.
 *
 * Wraps Supabase Storage `reading-media` bucket access for the reading pipeline.
 * Wave 3 cover-generator and illustration-generator depend on these helpers.
 *
 * Frozen contract (Wave 2):
 *   - uploadToReadingMedia: upload raw bytes -> public URL
 *   - downloadAndUploadFromUrl: fetch external image -> re-upload -> public URL
 *
 * This module intentionally does NOT perform image transcoding/resizing.
 * Resize/format conversion is delegated to Supabase Storage URL transforms
 * (e.g. `?width=800&format=webp&quality=70`) at consumption time.
 */

import { createServiceRoleClient } from "@/lib/supabase/server";

const BUCKET = "reading-media";
const DEFAULT_FETCH_TIMEOUT_MS = 30000;

export interface UploadOptions {
  /** Object path inside the bucket. MUST NOT start with "/". */
  path: string;
  /** Raw bytes to upload. */
  bytes: ArrayBuffer | Uint8Array;
  /** MIME type, e.g. "image/webp". */
  contentType: string;
  /** Overwrite existing object. Defaults to true. */
  upsert?: boolean;
}

export interface UploadResult {
  /** Public URL served by Supabase Storage. */
  url: string;
  /** Number of bytes uploaded. */
  bytes: number;
}

export interface DownloadAndUploadOptions {
  /** External URL to fetch the source image from. */
  externalUrl: string;
  /** Target object path inside the bucket. MUST NOT start with "/". */
  path: string;
  /** fetch() timeout in ms. Defaults to 30000. */
  fetchTimeoutMs?: number;
}

function byteLengthOf(bytes: ArrayBuffer | Uint8Array): number {
  // Uint8Array exposes byteLength; ArrayBuffer also exposes byteLength.
  return bytes.byteLength;
}

/**
 * Upload raw bytes to the `reading-media` bucket and return the public URL.
 *
 * Throws on:
 *   - path starting with "/"
 *   - Supabase upload error (message includes path + supabase error message)
 */
export async function uploadToReadingMedia(
  opts: UploadOptions
): Promise<UploadResult> {
  if (opts.path.startsWith("/")) {
    throw new Error("path must not start with /");
  }

  const supabase = await createServiceRoleClient();
  const upsert = opts.upsert ?? true;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(opts.path, opts.bytes, {
      contentType: opts.contentType,
      upsert,
    });

  if (uploadError) {
    throw new Error(
      `storage upload failed for path "${opts.path}": ${uploadError.message}`
    );
  }

  const { data: publicUrlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(opts.path);

  const url = publicUrlData?.publicUrl;
  if (!url) {
    throw new Error(
      `storage upload succeeded but public URL missing for path "${opts.path}"`
    );
  }

  return {
    url,
    bytes: byteLengthOf(opts.bytes),
  };
}

/**
 * Download an external image and re-upload it to `reading-media`.
 *
 * Throws on:
 *   - non-2xx fetch response  -> "fetch failed: <status>"
 *   - non-image content-type  -> "not an image: <content-type>"
 *   - any uploadToReadingMedia error
 */
export async function downloadAndUploadFromUrl(
  opts: DownloadAndUploadOptions
): Promise<UploadResult> {
  const timeoutMs = opts.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;

  const response = await fetch(opts.externalUrl, {
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`fetch failed: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    throw new Error(`not an image: ${contentType}`);
  }

  const arrayBuffer = await response.arrayBuffer();

  return uploadToReadingMedia({
    path: opts.path,
    bytes: arrayBuffer,
    contentType,
  });
}
