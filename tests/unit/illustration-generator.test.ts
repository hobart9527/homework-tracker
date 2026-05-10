/**
 * Wave 3 / W3-T2: illustration-generator unit tests.
 *
 * All downloadAndUploadFromUrl + buildCoverPrompt + fetch interactions are mocked.
 * No real network or Storage calls.
 *
 * Wave 1 task wave-1-2 added retry tests. To avoid real waiting we set
 * ILLUSTRATION_RETRY_BASE_DELAY_MS=0 before importing the module — this drives
 * computed backoff delays to 0ms so retries resolve effectively instantly.
 * (Approach picked over fake timers because the production loop awaits
 * setTimeout sequentially and fake timers would require manually advancing
 * inside an async generator, which adds noise without changing semantics.)
 */

process.env.ILLUSTRATION_RETRY_BASE_DELAY_MS = "0";

import { describe, it, expect, beforeEach, vi } from "vitest";

// --- Mock infrastructure --------------------------------------------------

const downloadAndUploadMock = vi.fn<
  (opts: {
    externalUrl: string;
    path: string;
  }) => Promise<{ url: string; bytes: number }>
>();

vi.mock("@/lib/reading/storage-uploader", () => ({
  downloadAndUploadFromUrl: (opts: {
    externalUrl: string;
    path: string;
  }) => downloadAndUploadMock(opts),
}));

const buildCoverPromptMock = vi.fn<
  (category: string, scene: string) => { positive: string; negative: string }
>();

vi.mock("@/lib/reading/cover-style-presets", () => ({
  buildCoverPrompt: (category: string, scene: string) =>
    buildCoverPromptMock(category, scene),
}));

import { generateIllustrations } from "@/lib/reading/illustration-generator";

// --- Helpers --------------------------------------------------------------

function setUploadSuccess(url: string, bytes: number): void {
  downloadAndUploadMock.mockResolvedValue({ url, bytes });
}

function setBuildCoverPromptResult(positive: string, negative: string): void {
  buildCoverPromptMock.mockReturnValue({ positive, negative });
}

function defaultOpts() {
  return {
    articleId: "art-123",
    language: "zh" as const,
    category: "科学",
    scenes: [
      { paragraphIndex: 0, sceneDescription: "atoms orbiting a nucleus" },
      { paragraphIndex: 2, sceneDescription: "a child looking through a microscope" },
    ],
  };
}

beforeEach(() => {
  downloadAndUploadMock.mockReset();
  buildCoverPromptMock.mockReset();
  vi.restoreAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  setBuildCoverPromptResult(
    "clean infographic illustration, scene: test",
    "no text labels, no logo, child-friendly"
  );
});

// --- Happy path -----------------------------------------------------------

describe("generateIllustrations - happy path", () => {
  it("returns 2 results for 2 scenes", async () => {
    // First scene succeeds
    downloadAndUploadMock.mockResolvedValueOnce({
      url: "https://example.supabase.co/storage/v1/object/public/reading-media/illustrations/art-123/0.webp",
      bytes: 12345,
    });
    // Second scene succeeds
    downloadAndUploadMock.mockResolvedValueOnce({
      url: "https://example.supabase.co/storage/v1/object/public/reading-media/illustrations/art-123/2.webp",
      bytes: 67890,
    });

    const result = await generateIllustrations(defaultOpts());

    expect(result).toHaveLength(2);
    expect(result[0].paragraph_index).toBe(0);
    expect(result[0].source).toBe("pollinations");
    expect(result[0].url).toContain("illustrations/art-123/0.webp");
    expect(result[0].bytes).toBe(12345);
    expect(result[0].source_url).toContain("image.pollinations.ai/prompt/");

    expect(result[1].paragraph_index).toBe(2);
    expect(result[1].url).toContain("illustrations/art-123/2.webp");
    expect(result[1].bytes).toBe(67890);

    // Verify prompt builder was called for each scene
    expect(buildCoverPromptMock).toHaveBeenCalledTimes(2);
    expect(buildCoverPromptMock.mock.calls[0]).toEqual([
      "科学",
      "atoms orbiting a nucleus",
    ]);
    expect(buildCoverPromptMock.mock.calls[1]).toEqual([
      "科学",
      "a child looking through a microscope",
    ]);

    // Verify storage paths
    expect(downloadAndUploadMock).toHaveBeenCalledTimes(2);
    expect(downloadAndUploadMock.mock.calls[0][0].path).toBe(
      "illustrations/art-123/0.webp"
    );
    expect(downloadAndUploadMock.mock.calls[1][0].path).toBe(
      "illustrations/art-123/2.webp"
    );
  });

  it("constructs Pollinations URL with correct parameters", async () => {
    setUploadSuccess(
      "https://example.supabase.co/storage/v1/object/public/reading-media/illustrations/art-123/0.webp",
      4096
    );

    setBuildCoverPromptResult(
      "friendly cartoon illustration, scene: test scene",
      "no text, child-friendly"
    );

    await generateIllustrations({
      articleId: "art-123",
      language: "en",
      category: "nature",
      scenes: [{ paragraphIndex: 1, sceneDescription: "a forest at dawn" }],
    });

    const { externalUrl } = downloadAndUploadMock.mock.calls[0][0];
    expect(externalUrl).toMatch(
      /^https:\/\/image\.pollinations\.ai\/prompt\//
    );
    expect(externalUrl).toContain("width=800");
    expect(externalUrl).toContain("height=533");
    expect(externalUrl).toContain("nologo=true");
    expect(externalUrl).toContain("seed=");
  });
});

// --- Empty scenes ---------------------------------------------------------

describe("generateIllustrations - empty scenes", () => {
  it("returns empty array when scenes is empty", async () => {
    const result = await generateIllustrations({
      ...defaultOpts(),
      scenes: [],
    });

    expect(result).toEqual([]);
    expect(downloadAndUploadMock).not.toHaveBeenCalled();
    expect(buildCoverPromptMock).not.toHaveBeenCalled();
  });
});

// --- Failure cases (non-blocking) -----------------------------------------

describe("generateIllustrations - downloadAndUploadFromUrl failure", () => {
  it("skips a failed scene and continues to the next", async () => {
    // First scene fails with a non-retryable error so we don't burn the
    // second-scene mock on retries. (Anything not matching the retry
    // predicate's substrings — 429, 5xx, "fetch failed", "network",
    // "timeout", "abort" — is non-retryable.)
    downloadAndUploadMock.mockRejectedValueOnce(
      new Error("storage rejected upload (400)")
    );
    // Second scene succeeds
    downloadAndUploadMock.mockResolvedValueOnce({
      url: "https://example.supabase.co/storage/v1/object/public/reading-media/illustrations/art-123/2.webp",
      bytes: 8192,
    });

    const result = await generateIllustrations(defaultOpts());

    expect(result).toHaveLength(1);
    expect(result[0].paragraph_index).toBe(2);
    expect(result[0].bytes).toBe(8192);

    // Both scenes were attempted (scene 0 once, scene 2 once).
    expect(downloadAndUploadMock).toHaveBeenCalledTimes(2);
  });

  it("returns empty array when all scenes fail", async () => {
    // Non-retryable so the call count is one per scene rather than maxAttempts.
    downloadAndUploadMock.mockRejectedValue(
      new Error("storage rejected upload (400)")
    );

    const result = await generateIllustrations(defaultOpts());

    expect(result).toEqual([]);
    expect(downloadAndUploadMock).toHaveBeenCalledTimes(2);
  });

  it("logs a warning when a scene fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    downloadAndUploadMock.mockRejectedValue(new Error("upload failed"));

    await generateIllustrations(defaultOpts());

    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy.mock.calls[0][0]).toContain("scene 0 failed");
    expect(warnSpy.mock.calls[0][0]).toContain("upload failed");
    expect(warnSpy.mock.calls[1][0]).toContain("scene 2 failed");
  });
});

describe("generateIllustrations - buildCoverPrompt failure", () => {
  it("skips scene when prompt building throws", async () => {
    buildCoverPromptMock.mockImplementationOnce(() => {
      throw new Error("unknown category");
    });
    buildCoverPromptMock.mockReturnValueOnce({
      positive: "test prompt",
      negative: "no text",
    });
    downloadAndUploadMock.mockResolvedValueOnce({
      url: "https://example.supabase.co/storage/v1/object/public/reading-media/illustrations/art-123/2.webp",
      bytes: 5120,
    });

    const result = await generateIllustrations(defaultOpts());

    expect(result).toHaveLength(1);
    expect(result[0].paragraph_index).toBe(2);
  });
});

// --- Retry / backoff (Wave 1 wave-1-2) ------------------------------------
//
// These tests rely on ILLUSTRATION_RETRY_BASE_DELAY_MS=0 (set at the top of
// this file before importing the module) so the exponential-backoff sleeps
// resolve immediately. Real-world defaults are 500ms / 8000ms / jitter 0.5
// with maxAttempts=4.

describe("generateIllustrations - retry behaviour", () => {
  it("single scene retries on 429 then succeeds", async () => {
    // First attempt 429 → retry → second attempt succeeds.
    downloadAndUploadMock.mockRejectedValueOnce(
      new Error("fetch failed: 429")
    );
    downloadAndUploadMock.mockResolvedValueOnce({
      url: "https://example.supabase.co/storage/v1/object/public/reading-media/illustrations/art-123/0.webp",
      bytes: 4242,
    });

    const result = await generateIllustrations({
      articleId: "art-123",
      language: "zh",
      category: "科学",
      scenes: [{ paragraphIndex: 0, sceneDescription: "atoms orbiting" }],
    });

    expect(result).toHaveLength(1);
    expect(result[0].paragraph_index).toBe(0);
    expect(result[0].bytes).toBe(4242);
    // Two underlying calls: 1 failure + 1 success.
    expect(downloadAndUploadMock).toHaveBeenCalledTimes(2);
  });

  it("scene fails after maxAttempts but other scenes still succeed", async () => {
    // Scene 0: four consecutive 429s → exhaust retries → swallowed.
    // Scene 2: one success on first attempt.
    downloadAndUploadMock
      .mockRejectedValueOnce(new Error("fetch failed: 429"))
      .mockRejectedValueOnce(new Error("fetch failed: 429"))
      .mockRejectedValueOnce(new Error("fetch failed: 429"))
      .mockRejectedValueOnce(new Error("fetch failed: 429"))
      .mockResolvedValueOnce({
        url: "https://example.supabase.co/storage/v1/object/public/reading-media/illustrations/art-123/2.webp",
        bytes: 9001,
      });

    const result = await generateIllustrations(defaultOpts());

    expect(result).toHaveLength(1);
    expect(result[0].paragraph_index).toBe(2);
    expect(result[0].bytes).toBe(9001);
    // 4 retries on scene 0 + 1 success on scene 2 = 5 calls.
    expect(downloadAndUploadMock).toHaveBeenCalledTimes(5);
  });

  it("non-retryable errors (e.g. 4xx 400) do not trigger retries", async () => {
    // Use a message that does NOT contain any of the retry predicate's
    // substrings (429, 5xx, "fetch failed", "network", "timeout", "abort").
    downloadAndUploadMock.mockRejectedValueOnce(
      new Error("storage rejected upload (400)")
    );
    downloadAndUploadMock.mockResolvedValueOnce({
      url: "https://example.supabase.co/storage/v1/object/public/reading-media/illustrations/art-123/2.webp",
      bytes: 1234,
    });

    const result = await generateIllustrations(defaultOpts());

    // Scene 0 fails immediately (no retry); scene 2 succeeds.
    expect(result).toHaveLength(1);
    expect(result[0].paragraph_index).toBe(2);
    // 1 call for scene 0 (no retry) + 1 call for scene 2.
    expect(downloadAndUploadMock).toHaveBeenCalledTimes(2);
  });
});
