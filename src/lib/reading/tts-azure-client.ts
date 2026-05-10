/**
 * Azure Speech Synthesis REST client for Chinese read-along audio.
 *
 * Frozen contract (W0b): thin wrapper over the Azure Cognitive Services
 * Text-to-Speech REST API. No SDK dependency — pure HTTP via global `fetch`
 * (Node 20+ native; Next.js 14 polyfills in older runtimes).
 *
 * Endpoint:
 *   POST https://${region}.tts.speech.microsoft.com/cognitiveservices/v1
 *
 * Headers:
 *   Ocp-Apim-Subscription-Key: <AZURE_SPEECH_KEY>
 *   Content-Type:              application/ssml+xml
 *   X-Microsoft-OutputFormat:  audio-24khz-48kbitrate-mono-mp3
 *   User-Agent:                homework-tracker-tts/1.0
 *
 * Body: SSML XML with <prosody rate=...> wrapping the text.
 *
 * Operational mode: when AZURE_SPEECH_KEY is empty/absent, `isTtsConfigured()`
 * returns false and `synthesizeChinese()` throws `MissingTtsKeyError`. This is
 * the explicit "skip cleanly" path while the key is being provisioned —
 * callers MUST catch and decide.
 *
 * NO retry logic at this layer. NO real API call from tests. Caller (pipeline)
 * decides retry / fallback policy.
 */

const AZURE_TTS_ENDPOINT_PATH =
  "/cognitiveservices/v1" as const;
const AZURE_TTS_OUTPUT_FORMAT =
  "audio-24khz-48kbitrate-mono-mp3" as const;
const AZURE_TTS_USER_AGENT = "homework-tracker-tts/1.0" as const;
const AZURE_TTS_TIMEOUT_MS = 60_000;

const DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural" as const;
const DEFAULT_REGION = "eastus" as const;
const DEFAULT_SPEAKING_RATE_PERCENT = -15; // slower for read-along
const DEFAULT_PITCH_PERCENT = 0;

export class MissingTtsKeyError extends Error {
  constructor() {
    super("AZURE_SPEECH_KEY not configured");
    this.name = "MissingTtsKeyError";
  }
}

export interface TtsSynthesizeOptions {
  /** Chinese text. Azure SSML body limit ~10MB; keep practical calls < 5000 chars. */
  text: string;
  /** Voice short name. Defaults to `zh-CN-XiaoxiaoNeural` (warm female, kid-friendly). */
  voice?: string;
  /** Prosody rate, percent offset from neutral. Range -50..+50. Default -15. */
  speakingRatePercent?: number;
  /** Prosody pitch, percent offset from neutral. Range -50..+50. Default 0. */
  pitchPercent?: number;
}

export interface TtsSynthesizeResult {
  /** mp3 binary (audio-24khz-48kbitrate-mono-mp3). */
  audioBytes: Uint8Array;
  mimeType: "audio/mpeg";
  /** Echo of voice actually requested (for record-keeping). */
  voice: string;
  /**
   * Estimated duration in seconds.
   *
   * Heuristic: Chinese reading at the default -15% rate ≈ 4 chars/sec, so
   * `Math.ceil(charCount / 4)`. Azure's REST endpoint does not return exact
   * audio duration; this is a rough estimate for UI/scheduling purposes only.
   */
  durationSecondsEstimate: number;
}

/**
 * Replace the five XML special characters with their entity references.
 * No external library — keep the surface tiny.
 */
function escapeXml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function formatSignedPercent(value: number): string {
  return value >= 0 ? `+${value}%` : `${value}%`;
}

function buildSsml(opts: {
  voice: string;
  text: string;
  rate: number;
  pitch: number;
}): string {
  const rateAttr = formatSignedPercent(opts.rate);
  const pitchAttr = formatSignedPercent(opts.pitch);
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">` +
    `<voice name="${escapeXml(opts.voice)}">` +
    `<prosody rate="${rateAttr}" pitch="${pitchAttr}">` +
    escapeXml(opts.text) +
    `</prosody>` +
    `</voice>` +
    `</speak>`
  );
}

function getRegion(): string {
  const region = process.env.AZURE_SPEECH_REGION?.trim();
  return region && region.length > 0 ? region : DEFAULT_REGION;
}

function getKey(): string {
  return process.env.AZURE_SPEECH_KEY?.trim() ?? "";
}

/**
 * Returns true when AZURE_SPEECH_KEY is present and non-empty (post-trim).
 * Pipeline scripts MUST call this before attempting synthesis to short-circuit
 * the disabled-mode case without paying for a thrown exception.
 */
export function isTtsConfigured(): boolean {
  return getKey().length > 0;
}

function estimateDurationSeconds(charCount: number): number {
  // Chinese read-along at -15% ≈ 4 chars/sec; round up so callers reserve
  // enough playback budget. Floor at 1s to avoid zero on empty/short input.
  const raw = Math.ceil(charCount / 4);
  return raw > 0 ? raw : 1;
}

/**
 * Synthesize Chinese audio via Azure Speech REST API.
 *
 * @throws MissingTtsKeyError when AZURE_SPEECH_KEY env is empty/absent.
 *         Callers MUST catch this and decide how to skip — this is the
 *         explicitly designed operational mode while the key is being
 *         provisioned.
 * @throws Error with HTTP status when Azure returns non-2xx.
 */
export async function synthesizeChinese(
  opts: TtsSynthesizeOptions
): Promise<TtsSynthesizeResult> {
  const key = getKey();
  if (key.length === 0) {
    throw new MissingTtsKeyError();
  }

  const voice = opts.voice ?? DEFAULT_VOICE;
  const rate = clamp(
    opts.speakingRatePercent ?? DEFAULT_SPEAKING_RATE_PERCENT,
    -50,
    50
  );
  const pitch = clamp(opts.pitchPercent ?? DEFAULT_PITCH_PERCENT, -50, 50);

  const region = getRegion();
  const endpoint = `https://${region}.tts.speech.microsoft.com${AZURE_TTS_ENDPOINT_PATH}`;
  const ssml = buildSsml({ voice, text: opts.text, rate, pitch });

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": AZURE_TTS_OUTPUT_FORMAT,
      "User-Agent": AZURE_TTS_USER_AGENT,
    },
    body: ssml,
    signal: AbortSignal.timeout(AZURE_TTS_TIMEOUT_MS),
  });

  if (!response.ok) {
    // Read a short snippet of the body for diagnostics; do not include the key.
    let bodyText = "";
    try {
      bodyText = await response.text();
    } catch {
      bodyText = "<unreadable body>";
    }
    throw new Error(
      `Azure TTS failed: ${response.status} ${response.statusText} — ${bodyText.slice(0, 200)}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const audioBytes = new Uint8Array(arrayBuffer);

  return {
    audioBytes,
    mimeType: "audio/mpeg",
    voice,
    durationSecondsEstimate: estimateDurationSeconds(opts.text.length),
  };
}
