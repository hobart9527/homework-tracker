/**
 * Wave 3 / W3-T1: cover-generator unit tests.
 *
 * All Supabase + downloadAndUploadFromUrl + fetch interactions are mocked.
 * No real network or Storage calls.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// --- Mock infrastructure --------------------------------------------------

const rpcMock = vi.fn<
  (
    name: string,
    params: { p_date: string; p_limit: number }
  ) => Promise<{ data: boolean | null; error: { message: string } | null }>
>();

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: vi.fn(async () => ({
    rpc: rpcMock,
  })),
}));

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

import { generateCover } from "@/lib/reading/cover-generator";
import {
  buildCoverPrompt,
  COVER_STYLES,
} from "@/lib/reading/cover-style-presets";

// --- Helpers --------------------------------------------------------------

function setQuota(result: boolean | null, error: string | null = null): void {
  rpcMock.mockResolvedValue({
    data: result,
    error: error ? { message: error } : null,
  });
}

function setUploadSuccess(url: string, bytes: number): void {
  downloadAndUploadMock.mockResolvedValue({ url, bytes });
}

function defaultOpts() {
  return {
    articleId: "art-123",
    language: "zh" as const,
    category: "成语故事",
    scene: "a fox at the well at dusk",
    title: "井底之蛙",
  };
}

beforeEach(() => {
  rpcMock.mockReset();
  downloadAndUploadMock.mockReset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  // Stub console.warn to keep test output clean while still letting us
  // observe fallback log messages via spy if needed.
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

// --- buildCoverPrompt -----------------------------------------------------

describe("buildCoverPrompt", () => {
  it("includes category-specific positive style for 成语故事 (ink painting)", () => {
    const { positive } = buildCoverPrompt(
      "成语故事",
      "a fox at the well at dusk"
    );
    expect(positive).toContain("ink painting");
    expect(positive).toContain("scene: a fox at the well at dusk");
  });

  it("falls back to 现代文 preset for unknown categories", () => {
    const { positive, negative } = buildCoverPrompt("未知分类", "a child reads");
    expect(positive).toContain(COVER_STYLES["现代文"].positive);
    expect(negative).toBe(COVER_STYLES["现代文"].negative);
  });

  it("injects the scene as `scene: <scene>` substring in positive prompt", () => {
    const { positive } = buildCoverPrompt("科学", "atoms orbiting a nucleus");
    expect(positive).toContain("scene: atoms orbiting a nucleus");
  });

  it("returns negative prompt with child-friendly safety tokens", () => {
    for (const key of Object.keys(COVER_STYLES)) {
      const { negative } = buildCoverPrompt(key, "x");
      expect(negative).toContain("no text");
      expect(negative).toContain("no logo");
      expect(negative).toContain("child-friendly");
    }
  });

  it("ships at least 10 category presets", () => {
    expect(Object.keys(COVER_STYLES).length).toBeGreaterThanOrEqual(10);
  });
});

// --- generateCover: MiniMax happy path ------------------------------------

describe("generateCover - MiniMax success", () => {
  it("uses MiniMax when quota OK and returns source=minimax with storage url", async () => {
    setQuota(true);
    setUploadSuccess(
      "https://example.supabase.co/storage/v1/object/public/reading-media/covers/art-123.webp",
      12345
    );

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [{ url: "https://cdn.minimax.example/xyz.webp" }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateCover(defaultOpts());

    expect(result.source).toBe("minimax");
    expect(result.url).toBe(
      "https://example.supabase.co/storage/v1/object/public/reading-media/covers/art-123.webp"
    );
    expect(result.source_url).toBe("https://cdn.minimax.example/xyz.webp");
    expect(result.bytes).toBe(12345);

    // Verify quota RPC was called with today's date YYYY-MM-DD
    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [rpcName, rpcParams] = rpcMock.mock.calls[0];
    expect(rpcName).toBe("increment_minimax_quota");
    expect(rpcParams.p_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Make sure it actually equals today's UTC date
    const expectedDate = new Date().toISOString().slice(0, 10);
    expect(rpcParams.p_date).toBe(expectedDate);

    // Verify MiniMax was called with image-01 + correct prompt body
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0];
    expect(String(calledUrl)).toContain("/image_generation");
    const body = JSON.parse((calledInit as RequestInit).body as string);
    expect(body.model).toBe("image-01");
    expect(body.aspect_ratio).toBe("3:2");
    expect(body.prompt).toContain("ink painting");
    expect(body.prompt).toContain("scene: a fox at the well at dusk");
    expect(body.negative_prompt).toContain("child-friendly");

    // Storage path matches articleId
    expect(downloadAndUploadMock).toHaveBeenCalledTimes(1);
    expect(downloadAndUploadMock.mock.calls[0][0]).toEqual({
      externalUrl: "https://cdn.minimax.example/xyz.webp",
      path: "covers/art-123.webp",
    });
  });
});

// --- generateCover: quota exhausted ---------------------------------------

describe("generateCover - quota exhausted falls back to Pollinations", () => {
  it("skips MiniMax entirely when quota RPC returns false", async () => {
    setQuota(false);
    setUploadSuccess(
      "https://example.supabase.co/storage/v1/object/public/reading-media/covers/art-123.webp",
      4096
    );

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateCover(defaultOpts());

    expect(result.source).toBe("pollinations");
    expect(result.source_url).toMatch(/^https:\/\/image\.pollinations\.ai\//);
    expect(result.url).toContain("reading-media/covers/art-123.webp");
    expect(result.bytes).toBe(4096);

    // MiniMax fetch must not have been called
    expect(fetchMock).not.toHaveBeenCalled();

    // Pollinations request goes through downloadAndUploadFromUrl
    expect(downloadAndUploadMock).toHaveBeenCalledTimes(1);
    const args = downloadAndUploadMock.mock.calls[0][0];
    expect(args.path).toBe("covers/art-123.webp");
    expect(args.externalUrl).toContain("image.pollinations.ai/prompt/");
    expect(args.externalUrl).toContain("width=800&height=533");
    expect(args.externalUrl).toContain("nologo=true");
  });
});

// --- generateCover: MiniMax network error → Pollinations -----------------

describe("generateCover - MiniMax fetch error falls back", () => {
  it("falls back to Pollinations when MiniMax fetch throws", async () => {
    setQuota(true);
    setUploadSuccess(
      "https://example.supabase.co/storage/v1/object/public/reading-media/covers/art-123.webp",
      2048
    );

    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateCover(defaultOpts());

    expect(result.source).toBe("pollinations");
    expect(result.source_url).toContain("image.pollinations.ai");
    // MiniMax was attempted exactly once before the fallback
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(downloadAndUploadMock).toHaveBeenCalledTimes(1);
  });
});

// --- generateCover: MiniMax HTTP 500 → Pollinations ----------------------

describe("generateCover - MiniMax HTTP 5xx falls back", () => {
  it("falls back to Pollinations when MiniMax returns non-2xx", async () => {
    setQuota(true);
    setUploadSuccess(
      "https://example.supabase.co/storage/v1/object/public/reading-media/covers/art-123.webp",
      512
    );

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "internal" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateCover(defaultOpts());

    expect(result.source).toBe("pollinations");
    expect(result.source_url).toContain("image.pollinations.ai");
    // MiniMax fetched once, Pollinations went through downloadAndUploadMock
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(downloadAndUploadMock).toHaveBeenCalledTimes(1);
  });
});

// --- generateCover: Pollinations failure → throw -------------------------

describe("generateCover - Pollinations failure throws", () => {
  it("throws `cover generation failed: <reason>` when Pollinations download fails", async () => {
    setQuota(false); // skip MiniMax → straight to Pollinations
    downloadAndUploadMock.mockRejectedValue(new Error("fetch failed: 502"));

    await expect(generateCover(defaultOpts())).rejects.toThrow(
      /cover generation failed: fetch failed: 502/
    );
  });

  it("throws `cover generation failed` when MiniMax AND Pollinations both fail", async () => {
    setQuota(true);
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("minimax network"));
    vi.stubGlobal("fetch", fetchMock);
    downloadAndUploadMock.mockRejectedValue(new Error("pollinations down"));

    await expect(generateCover(defaultOpts())).rejects.toThrow(
      /cover generation failed: pollinations down/
    );
    // MiniMax attempted once, then Pollinations attempted once via uploader
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(downloadAndUploadMock).toHaveBeenCalledTimes(1);
  });
});
