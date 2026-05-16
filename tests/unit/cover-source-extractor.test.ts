/**
 * Unit tests for cover-source-extractor.
 *
 * All fetch + uploadToReadingMedia interactions are mocked.
 * No real network or Storage calls.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const uploadToReadingMediaMock = vi.fn<
  (opts: {
    path: string;
    bytes: ArrayBuffer;
    contentType: string;
    upsert?: boolean;
  }) => Promise<{ url: string; bytes: number }>
>();

vi.mock("@/lib/reading/storage-uploader", () => ({
  uploadToReadingMedia: (opts: {
    path: string;
    bytes: ArrayBuffer;
    contentType: string;
    upsert?: boolean;
  }) => uploadToReadingMediaMock(opts),
}));

import { generateCoverFromSource } from "@/lib/reading/cover-source-extractor";

// --- Helpers ---------------------------------------------------------------

function makeResponse(opts: {
  ok: boolean;
  status?: number;
  contentType?: string;
  body?: ArrayBuffer;
}): Response {
  return {
    ok: opts.ok,
    status: opts.status ?? (opts.ok ? 200 : 400),
    headers: new Headers(
      opts.contentType ? { "content-type": opts.contentType } : {}
    ),
    arrayBuffer: async () => opts.body ?? new ArrayBuffer(0),
  } as Response;
}

beforeEach(() => {
  uploadToReadingMediaMock.mockReset();
  vi.restoreAllMocks();
});

// --- generateCoverFromSource -----------------------------------------------

describe("generateCoverFromSource", () => {
  it("returns upload result on happy path (image/png)", async () => {
    const body = new Uint8Array(2048).buffer;
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse({
        ok: true,
        contentType: "image/png",
        body,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    uploadToReadingMediaMock.mockResolvedValue({
      url: "https://example.supabase.co/storage/v1/object/public/reading-media/covers/art-123.png",
      bytes: 2048,
    });

    const result = await generateCoverFromSource(
      "https://source.example.com/img.png",
      "art-123"
    );

    expect(result).not.toBeNull();
    expect(result!.source).toBe("source-website");
    expect(result!.source_url).toBe("https://source.example.com/img.png");
    expect(result!.url).toContain("covers/art-123.png");
    expect(result!.bytes).toBe(2048);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe("https://source.example.com/img.png");
    expect((calledInit as RequestInit).headers).toEqual({
      "User-Agent": "Mozilla/5.0 (compatible; HomeworkTracker/1.0)",
    });

    expect(uploadToReadingMediaMock).toHaveBeenCalledTimes(1);
    const uploadArgs = uploadToReadingMediaMock.mock.calls[0][0];
    expect(uploadArgs.path).toBe("covers/art-123.png");
    expect(uploadArgs.contentType).toBe("image/png");
    expect(uploadArgs.upsert).toBe(true);
    expect(uploadArgs.bytes.byteLength).toBe(2048);
  });

  it("maps webp content-type to webp extension", async () => {
    const body = new Uint8Array(2048).buffer;
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse({
        ok: true,
        contentType: "image/webp",
        body,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    uploadToReadingMediaMock.mockResolvedValue({
      url: "https://example.supabase.co/storage/v1/object/public/reading-media/covers/art-456.webp",
      bytes: 2048,
    });

    const result = await generateCoverFromSource(
      "https://source.example.com/img.webp",
      "art-456"
    );

    expect(result).not.toBeNull();
    expect(result!.url).toContain("covers/art-456.webp");
    expect(uploadToReadingMediaMock.mock.calls[0][0].path).toBe(
      "covers/art-456.webp"
    );
  });

  it("maps gif content-type to gif extension", async () => {
    const body = new Uint8Array(2048).buffer;
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse({
        ok: true,
        contentType: "image/gif",
        body,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    uploadToReadingMediaMock.mockResolvedValue({
      url: "https://example.supabase.co/storage/v1/object/public/reading-media/covers/art-789.gif",
      bytes: 2048,
    });

    const result = await generateCoverFromSource(
      "https://source.example.com/img.gif",
      "art-789"
    );

    expect(result).not.toBeNull();
    expect(result!.url).toContain("covers/art-789.gif");
  });

  it("defaults to jpg extension for unknown image types", async () => {
    const body = new Uint8Array(2048).buffer;
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse({
        ok: true,
        contentType: "image/avif",
        body,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    uploadToReadingMediaMock.mockResolvedValue({
      url: "https://example.supabase.co/storage/v1/object/public/reading-media/covers/art-000.jpg",
      bytes: 2048,
    });

    const result = await generateCoverFromSource(
      "https://source.example.com/img.avif",
      "art-000"
    );

    expect(result).not.toBeNull();
    expect(result!.url).toContain("covers/art-000.jpg");
  });

  it("returns null when fetch response is not ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse({ ok: false, status: 404 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateCoverFromSource(
      "https://source.example.com/missing.jpg",
      "art-404"
    );

    expect(result).toBeNull();
    expect(uploadToReadingMediaMock).not.toHaveBeenCalled();
  });

  it("returns null when fetch throws (network/timeout)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("timeout"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateCoverFromSource(
      "https://source.example.com/slow.jpg",
      "art-timeout"
    );

    expect(result).toBeNull();
    expect(uploadToReadingMediaMock).not.toHaveBeenCalled();
  });

  it("returns null when content-type is not image/*", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse({
        ok: true,
        contentType: "text/html",
        body: new ArrayBuffer(2048),
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateCoverFromSource(
      "https://source.example.com/page.html",
      "art-html"
    );

    expect(result).toBeNull();
    expect(uploadToReadingMediaMock).not.toHaveBeenCalled();
  });

  it("returns null when content-type header is missing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse({
        ok: true,
        body: new ArrayBuffer(2048),
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateCoverFromSource(
      "https://source.example.com/no-ct.jpg",
      "art-noct"
    );

    expect(result).toBeNull();
    expect(uploadToReadingMediaMock).not.toHaveBeenCalled();
  });

  it("returns null when image is smaller than 1024 bytes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse({
        ok: true,
        contentType: "image/png",
        body: new Uint8Array(512).buffer,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateCoverFromSource(
      "https://source.example.com/tiny.png",
      "art-tiny"
    );

    expect(result).toBeNull();
    expect(uploadToReadingMediaMock).not.toHaveBeenCalled();
  });

  it("returns null when uploadToReadingMedia throws", async () => {
    const body = new Uint8Array(2048).buffer;
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse({
        ok: true,
        contentType: "image/png",
        body,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    uploadToReadingMediaMock.mockRejectedValue(
      new Error("storage upload failed")
    );

    const result = await generateCoverFromSource(
      "https://source.example.com/img.png",
      "art-upload-fail"
    );

    expect(result).toBeNull();
    expect(uploadToReadingMediaMock).toHaveBeenCalledTimes(1);
  });
});
