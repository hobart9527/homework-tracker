import { describe, expect, it, vi } from "vitest";
import {
  AUDIO_RECORDING_BITS_PER_SECOND,
  resolveAudioRecordingFormat,
} from "@/lib/audio-recording";

describe("resolveAudioRecordingFormat", () => {
  it("uses a homework-friendly recording bitrate", () => {
    expect(AUDIO_RECORDING_BITS_PER_SECOND).toBe(64000);
  });

  it("prefers Safari-friendly mp4 recording when available", () => {
    class MockMediaRecorder {}

    Object.defineProperty(globalThis, "MediaRecorder", {
      configurable: true,
      writable: true,
      value: Object.assign(MockMediaRecorder, {
        isTypeSupported: vi.fn((mimeType: string) =>
          mimeType === "audio/mp4;codecs=mp4a.40.2" || mimeType === "audio/mp4"
        ),
      }),
    });

    expect(resolveAudioRecordingFormat()).toEqual({
      mimeType: "audio/mp4;codecs=mp4a.40.2",
      extension: "m4a",
    });
  });

  it("falls back to webm when mp4 is unavailable", () => {
    class MockMediaRecorder {}

    Object.defineProperty(globalThis, "MediaRecorder", {
      configurable: true,
      writable: true,
      value: Object.assign(MockMediaRecorder, {
        isTypeSupported: vi.fn((mimeType: string) => mimeType === "audio/webm"),
      }),
    });

    expect(resolveAudioRecordingFormat()).toEqual({
      mimeType: "audio/webm",
      extension: "webm",
    });
  });
});
