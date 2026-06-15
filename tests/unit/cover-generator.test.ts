/**
 * Wave 3 / W3-T1: cover-generator unit tests.
 *
 * All Supabase + downloadAndUploadFromUrl + fetch interactions are mocked.
 * No real network or Storage calls.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

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

// Stub Math.random so variant selection is deterministic in tests.
let mathRandomValue = 0;

function setRandomValue(v: number): void {
  mathRandomValue = v;
}

beforeEach(() => {
  mathRandomValue = 0.3;
  // Override Math.random globally for our tests
  vi.spyOn(Math, "random").mockImplementation(() => mathRandomValue);
});

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
  // Re-apply Math.random stub (restoreAllMocks clears it)
  vi.spyOn(Math, "random").mockImplementation(() => mathRandomValue);
  // Force retry backoff to 1ms (jittered range 0.5-1.5ms) so retry tests
  // don't introduce real wait time. Production default is 500ms.
  process.env.COVER_RETRY_BASE_DELAY_MS = "1";
});

afterEach(() => {
  delete process.env.COVER_RETRY_BASE_DELAY_MS;
});

// --- buildCoverPrompt -----------------------------------------------------

describe("buildCoverPrompt", () => {
  it("picks a random positive variant from the preset's array", () => {
    setRandomValue(0.1);
    const { positive } = buildCoverPrompt(
      "成语故事",
      "a fox at the well at dusk"
    );
    // At random=0.1, picks variant index 0
    expect(COVER_STYLES["成语故事"].positive).toContain(positive.split(", scene:")[0]);
    expect(positive).toContain("scene: a fox at the well at dusk");
  });

  it("injects title as article theme when provided", () => {
    const { positive } = buildCoverPrompt("科学", "atoms", "奇妙原子");
    expect(positive).toContain("article theme: '奇妙原子'");
    expect(positive).toContain("scene: atoms");
  });

  it("does NOT inject article theme when title is omitted", () => {
    const { positive } = buildCoverPrompt("科学", "atoms");
    expect(positive).not.toContain("article theme:");
    expect(positive).toContain("scene: atoms");
  });

  it("falls back to 现代文 preset for unknown categories", () => {
    const { positive, negative } = buildCoverPrompt("未知分类", "a child reads");
    // The positive array — check that any variant starts with the same prefix
    const modernPreset = COVER_STYLES["现代文"];
    expect(modernPreset.positive.some((p: string) => positive.startsWith(p))).toBe(true);
    expect(negative).toBe(modernPreset.negative);
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

  it("each preset has at least 2 positive style variants", () => {
    for (const [key, preset] of Object.entries(COVER_STYLES)) {
      expect(
        preset.positive.length,
        `"${key}" should have >= 2 style variants`
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it("produces different positive prompts for different random values", () => {
    setRandomValue(0.1);
    const r1 = buildCoverPrompt("成语故事", "scene one");
    setRandomValue(0.6);
    const r2 = buildCoverPrompt("成语故事", "scene one");
    // With 3 variants and distinct random seeds, should get different variants
    expect(r1.positive).not.toBe(r2.positive);
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

// --- generateCover: all providers failed → null -------------------------

describe("generateCover - all providers failed returns null", () => {
  it("returns null when Pollinations download fails", async () => {
    setQuota(false); // skip MiniMax → straight to Pollinations
    downloadAndUploadMock.mockRejectedValue(new Error("fetch failed: 502"));

    const result = await generateCover(defaultOpts());
    expect(result).toBeNull();
  });

  it("returns null when MiniMax AND Pollinations both fail", async () => {
    setQuota(true);
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("minimax network"));
    vi.stubGlobal("fetch", fetchMock);
    downloadAndUploadMock.mockRejectedValue(new Error("pollinations down"));

    const result = await generateCover(defaultOpts());
    expect(result).toBeNull();
    // MiniMax attempted once, then Pollinations attempted once via uploader
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(downloadAndUploadMock).toHaveBeenCalledTimes(1);
  });
});

// --- generateCover: Pollinations retry on transient failures -------------
//
// Retry contract (Wave 1 frozen contract):
//   - maxAttempts: 4 (1 original + up to 3 retries)
//   - baseDelayMs: 500 in prod; tests force 1ms via COVER_RETRY_BASE_DELAY_MS
//     env var (set in beforeEach, cleared in afterEach) so the suite stays
//     fast without real-clock waiting.
//   - retriable errors: HTTP 429 / 5xx / network / timeout / abort.
//   - non-retriable errors (e.g. 4xx other than 429) are thrown immediately.

describe("generateCover - Pollinations retry on transient failures", () => {
  it("retries on 429 then succeeds (Pollinations path, source=pollinations)", async () => {
    setQuota(false); // skip MiniMax → straight to Pollinations
    downloadAndUploadMock
      .mockRejectedValueOnce(new Error("fetch failed: 429"))
      .mockResolvedValueOnce({
        url: "https://example.supabase.co/storage/v1/object/public/reading-media/covers/art-123.webp",
        bytes: 7777,
      });

    const result = await generateCover(defaultOpts());

    expect(result.source).toBe("pollinations");
    expect(result.url).toContain("reading-media/covers/art-123.webp");
    expect(result.bytes).toBe(7777);
    // Original call + 1 retry = 2 invocations
    expect(downloadAndUploadMock).toHaveBeenCalledTimes(2);
  });

  it("returns null after maxAttempts (4) consecutive 429 retriable failures", async () => {
    setQuota(false); // skip MiniMax → straight to Pollinations
    downloadAndUploadMock.mockRejectedValue(new Error("fetch failed: 429"));

    const result = await generateCover(defaultOpts());
    expect(result).toBeNull();
    // maxAttempts = 4 → uploader invoked exactly 4 times before the
    // outer try/catch wraps the final error.
    expect(downloadAndUploadMock).toHaveBeenCalledTimes(4);
  });

  it("retries on 402 then succeeds (Pollinations path, source=pollinations)", async () => {
    setQuota(false); // skip MiniMax → straight to Pollinations
    downloadAndUploadMock
      .mockRejectedValueOnce(new Error("fetch failed: 402"))
      .mockResolvedValueOnce({
        url: "https://example.supabase.co/storage/v1/object/public/reading-media/covers/art-123.webp",
        bytes: 8888,
      });

    const result = await generateCover(defaultOpts());

    expect(result.source).toBe("pollinations");
    expect(result.url).toContain("reading-media/covers/art-123.webp");
    expect(result.bytes).toBe(8888);
    // Original call + 1 retry = 2 invocations
    expect(downloadAndUploadMock).toHaveBeenCalledTimes(2);
  });

  it("returns null after maxAttempts (4) consecutive 402 retriable failures", async () => {
    setQuota(false); // skip MiniMax → straight to Pollinations
    downloadAndUploadMock.mockRejectedValue(new Error("fetch failed: 402"));

    const result = await generateCover(defaultOpts());
    expect(result).toBeNull();
    // maxAttempts = 4 → uploader invoked exactly 4 times before exhausting
    expect(downloadAndUploadMock).toHaveBeenCalledTimes(4);
  });

  it("returns null on non-retriable 4xx (e.g. 400)", async () => {
    setQuota(false);
    downloadAndUploadMock.mockRejectedValue(new Error("fetch failed: 400"));

    const result = await generateCover(defaultOpts());
    expect(result).toBeNull();
    // No retries → exactly 1 invocation
    expect(downloadAndUploadMock).toHaveBeenCalledTimes(1);
  });
});
