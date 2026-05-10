/**
 * Reading audio storage uploader.
 *
 * Wraps Supabase Storage `reading-audios` bucket access for the Chinese
 * read-along pipeline. The W0b TTS pipeline produces MP3 bytes via
 * tts-azure-client; this module persists them to Supabase Storage and
 * returns the public URL the caller writes back into
 * reading_articles.audio_zh_url.
 *
 * Frozen contract (W0b):
 *   - Bucket: reading-audios
 *   - Path:   audio/zh/${articleId}.mp3
 *   - MIME:   audio/mpeg
 *   - Public read; service-role write only
 *
 * This module intentionally does NOT update the reading_articles row.
 * The caller is responsible for persisting the returned publicUrl/voice
 * fields into the database (separation of concerns).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "reading-audios";
const AUDIO_MIME = "audio/mpeg";

export interface UploadAudioInput {
  articleId: string;
  audioBytes: Uint8Array; // from tts-azure-client
  voice: string; // e.g., 'zh-CN-XiaoxiaoNeural' — for the audio_zh_voice DB field
  durationSecondsEstimate: number;
}

export interface UploadAudioResult {
  publicUrl: string; // Supabase Storage public URL
  storagePath: string; // e.g., 'audio/zh/<id>.mp3'
  voice: string;
  durationSecondsEstimate: number;
}

/**
 * Uploads audio to the reading-audios bucket and returns the public URL.
 * Idempotent: if the same path exists, it overwrites (upsert).
 * Caller is responsible for updating reading_articles.audio_zh_url with the result.
 */
export async function uploadChineseAudio(
  supabase: SupabaseClient,
  input: UploadAudioInput,
): Promise<UploadAudioResult> {
  const storagePath = `audio/zh/${input.articleId}.mp3`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, input.audioBytes, {
      contentType: AUDIO_MIME,
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Audio upload failed: ${uploadError.message}`);
  }

  const { data: publicUrlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(storagePath);

  const publicUrl = publicUrlData?.publicUrl;
  if (!publicUrl) {
    throw new Error(
      `Audio upload succeeded but public URL missing for path "${storagePath}"`,
    );
  }

  return {
    publicUrl,
    storagePath,
    voice: input.voice,
    durationSecondsEstimate: input.durationSecondsEstimate,
  };
}
