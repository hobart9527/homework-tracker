const AUDIO_RECORDING_CANDIDATES = [
  { mimeType: "audio/mp4;codecs=mp4a.40.2", extension: "m4a" },
  { mimeType: "audio/mp4", extension: "m4a" },
  { mimeType: "audio/webm;codecs=opus", extension: "webm" },
  { mimeType: "audio/webm", extension: "webm" },
  { mimeType: "audio/ogg;codecs=opus", extension: "ogg" },
  { mimeType: "audio/ogg", extension: "ogg" },
] as const;

export const AUDIO_RECORDING_BITS_PER_SECOND = 64000;

export function resolveAudioRecordingFormat() {
  if (
    typeof MediaRecorder === "undefined" ||
    typeof MediaRecorder.isTypeSupported !== "function"
  ) {
    return { mimeType: "", extension: "webm" };
  }

  const supported = AUDIO_RECORDING_CANDIDATES.find((candidate) =>
    MediaRecorder.isTypeSupported(candidate.mimeType)
  );

  return supported ?? { mimeType: "", extension: "webm" };
}
