/**
 * Wave 3 / W3-T2: illustration-generator unit tests.
 *
 * All downloadAndUploadFromUrl + buildCoverPrompt + fetch interactions are mocked.
 * No real network or Storage calls.
 */

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
    // First scene fails
    downloadAndUploadMock.mockRejectedValueOnce(
      new Error("fetch failed: 502")
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

    // Both scenes were attempted
    expect(downloadAndUploadMock).toHaveBeenCalledTimes(2);
  });

  it("returns empty array when all scenes fail", async () => {
    downloadAndUploadMock.mockRejectedValue(new Error("network error"));

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
