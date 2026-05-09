/**
 * Wave 2 / W2-T3: storage-uploader unit tests.
 *
 * All Supabase + fetch interactions are mocked. No real network or Storage
 * calls are made.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// --- Supabase mock infrastructure ----------------------------------------

type UploadFn = (
  path: string,
  bytes: unknown,
  options: { contentType?: string; upsert?: boolean }
) => Promise<{ data: unknown; error: { message: string } | null }>;

type GetPublicUrlFn = (path: string) => {
  data: { publicUrl: string };
};

const uploadMock = vi.fn<UploadFn>();
const getPublicUrlMock = vi.fn<GetPublicUrlFn>();

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: vi.fn(async () => ({
    storage: {
      from: (_bucket: string) => ({
        upload: uploadMock,
        getPublicUrl: getPublicUrlMock,
      }),
    },
  })),
}));

import {
  uploadToReadingMedia,
  downloadAndUploadFromUrl,
} from "@/lib/reading/storage-uploader";

// --- Helpers --------------------------------------------------------------

function setUploadSuccess(publicUrl: string): void {
  uploadMock.mockResolvedValue({
    data: { path: "ignored" },
    error: null,
  });
  getPublicUrlMock.mockReturnValue({ data: { publicUrl } });
}

function setUploadFailure(message: string): void {
  uploadMock.mockResolvedValue({
    data: null,
    error: { message },
  });
}

beforeEach(() => {
  uploadMock.mockReset();
  getPublicUrlMock.mockReset();
  vi.restoreAllMocks();
});

// --- uploadToReadingMedia -------------------------------------------------

describe("uploadToReadingMedia", () => {
  it("uploads bytes and returns public url + byte length on happy path", async () => {
    setUploadSuccess(
      "https://example.supabase.co/storage/v1/object/public/reading-media/covers/abc.webp"
    );

    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const result = await uploadToReadingMedia({
      path: "covers/abc.webp",
      bytes,
      contentType: "image/webp",
    });

    expect(result.url).toBe(
      "https://example.supabase.co/storage/v1/object/public/reading-media/covers/abc.webp"
    );
    expect(result.bytes).toBe(5);

    expect(uploadMock).toHaveBeenCalledTimes(1);
    const callArgs = uploadMock.mock.calls[0];
    expect(callArgs[0]).toBe("covers/abc.webp");
    expect(callArgs[1]).toBe(bytes);
    expect(callArgs[2]).toEqual({
      contentType: "image/webp",
      upsert: true, // default
    });
    expect(getPublicUrlMock).toHaveBeenCalledWith("covers/abc.webp");
  });

  it("forwards upsert=false when explicitly set", async () => {
    setUploadSuccess("https://example.com/x.webp");

    await uploadToReadingMedia({
      path: "covers/x.webp",
      bytes: new Uint8Array([0]),
      contentType: "image/webp",
      upsert: false,
    });

    expect(uploadMock.mock.calls[0][2]).toEqual({
      contentType: "image/webp",
      upsert: false,
    });
  });

  it("throws when path starts with /", async () => {
    await expect(
      uploadToReadingMedia({
        path: "/covers/abc.webp",
        bytes: new Uint8Array([1]),
        contentType: "image/webp",
      })
    ).rejects.toThrow(/path must not start with \//);

    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("throws including the path when supabase upload fails", async () => {
    setUploadFailure("Bucket not found");

    await expect(
      uploadToReadingMedia({
        path: "covers/fail.webp",
        bytes: new Uint8Array([1, 2]),
        contentType: "image/webp",
      })
    ).rejects.toThrow(/covers\/fail\.webp.*Bucket not found/);
  });
});

// --- downloadAndUploadFromUrl --------------------------------------------

describe("downloadAndUploadFromUrl", () => {
  it("downloads, validates content-type, and re-uploads on happy path", async () => {
    setUploadSuccess(
      "https://example.supabase.co/storage/v1/object/public/reading-media/illustrations/x/0.webp"
    );

    const fakeBytes = new Uint8Array([9, 9, 9, 9]).buffer;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "image/webp" }),
      arrayBuffer: async () => fakeBytes,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await downloadAndUploadFromUrl({
      externalUrl: "https://cdn.example.com/x.webp",
      path: "illustrations/x/0.webp",
    });

    expect(result.url).toBe(
      "https://example.supabase.co/storage/v1/object/public/reading-media/illustrations/x/0.webp"
    );
    expect(result.bytes).toBe(4);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://cdn.example.com/x.webp");

    // Ensure upload received the fetched content-type
    expect(uploadMock.mock.calls[0][2]).toEqual({
      contentType: "image/webp",
      upsert: true,
    });
  });

  it("throws fetch failed when response is not ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers(),
      arrayBuffer: async () => new ArrayBuffer(0),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      downloadAndUploadFromUrl({
        externalUrl: "https://cdn.example.com/missing.webp",
        path: "illustrations/x/0.webp",
      })
    ).rejects.toThrow(/fetch failed: 404/);

    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("throws not an image when content-type is not image/*", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/html" }),
      arrayBuffer: async () => new ArrayBuffer(0),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      downloadAndUploadFromUrl({
        externalUrl: "https://cdn.example.com/page.html",
        path: "illustrations/x/0.webp",
      })
    ).rejects.toThrow(/not an image: text\/html/);

    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("propagates path validation errors from uploadToReadingMedia", async () => {
    const fakeBytes = new Uint8Array([1, 2, 3]).buffer;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "image/png" }),
      arrayBuffer: async () => fakeBytes,
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      downloadAndUploadFromUrl({
        externalUrl: "https://cdn.example.com/x.png",
        path: "/illustrations/x/0.webp", // invalid leading slash
      })
    ).rejects.toThrow(/path must not start with \//);

    expect(uploadMock).not.toHaveBeenCalled();
  });
});
