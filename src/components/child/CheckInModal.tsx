"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { AudioPlayer } from "@/components/ui/AudioPlayer";
import { buildVoicePushTaskPayload } from "@/lib/family-notifications";
import { createVoicePushTask } from "@/lib/voice-push-tasks";
import {
  AUDIO_RECORDING_BITS_PER_SECOND,
  resolveAudioRecordingFormat,
} from "@/lib/audio-recording";
import type { Database } from "@/lib/supabase/types";
import type { AttachmentUploadStatus } from "@/lib/attachment-types";
import { useTranslation } from "@/hooks/useTranslation";

type Homework = Database["public"]["Tables"]["homeworks"]["Row"];
type CheckIn = Database["public"]["Tables"]["check_ins"]["Row"];

interface CheckInModalProps {
  homework: Homework;
  targetDate?: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (checkIn?: CheckIn) => void;
  onAttachmentUploadStatusChange?: (status: AttachmentUploadStatus) => void;
}

export function CheckInModal({
  homework,
  targetDate,
  isOpen,
  onClose,
  onSuccess,
  onAttachmentUploadStatusChange,
}: CheckInModalProps) {
  const { t } = useTranslation();
  const supabase = createClient();
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const submittingRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [submissionState, setSubmissionState] = useState<
    "idle" | "submitting" | "error" | "success"
  >("idle");
  const [attachments, setAttachments] = useState<
    {
      type: string;
      file: File;
      previewUrl: string;
      durationSeconds?: number | null;
    }[]
  >([]);
  const [note, setNote] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordingElapsedSeconds, setRecordingElapsedSeconds] = useState(0);
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(null);
  const [uploadStatus, setUploadStatus] = useState<AttachmentUploadStatus | null>(null);
  const [createdCheckInId, setCreatedCheckInId] = useState<string | null>(null);
  const [unsavedConfirmPending, setUnsavedConfirmPending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const maxRecordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  const MAX_RECORDING_SECONDS = 3600;

  const hasUnsaved = (attachments.length > 0 || recording) && !createdCheckInId;

  const handleClose = useCallback(() => {
    if (hasUnsaved) {
      // If unsavedConfirmPending already showing, ignore additional close attempts
      if (unsavedConfirmPending) return;
      setUnsavedConfirmPending(true);
      return;
    }
    onClose();
  }, [hasUnsaved, unsavedConfirmPending, onClose]);

  useEffect(() => {
    if (!isOpen) {
      attachments.forEach((attachment) => {
        if (attachment.previewUrl) {
          URL.revokeObjectURL(attachment.previewUrl);
        }
      });
      setLoading(false);
      setFeedback("");
      setSubmissionState("idle");
      setAttachments([]);
      setNote("");
      setRecording(false);
      setRecordingElapsedSeconds(0);
      setRecordingStartedAt(null);
      setUploadStatus(null);
      setCreatedCheckInId(null);
      recordingStartedAtRef.current = null;
      submittingRef.current = false;
      if (maxRecordingTimerRef.current) {
        clearTimeout(maxRecordingTimerRef.current);
        maxRecordingTimerRef.current = null;
      }
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stop();
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      attachments.forEach((attachment) => {
        if (attachment.previewUrl) {
          URL.revokeObjectURL(attachment.previewUrl);
        }
      });
      if (maxRecordingTimerRef.current) {
        clearTimeout(maxRecordingTimerRef.current);
      }
    };
  }, [attachments]);

  useEffect(() => {
    if (!recording || recordingStartedAt == null) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const elapsed = Math.max(
        0,
        Math.floor((Date.now() - recordingStartedAt) / 1000)
      );
      setRecordingElapsedSeconds(elapsed);

      if (elapsed >= MAX_RECORDING_SECONDS && mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
      }
    }, 200);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [recording, recordingStartedAt]);

  const formatDuration = (totalSeconds: number) => {
    const safeSeconds = Math.max(0, totalSeconds);
    const minutes = Math.floor(safeSeconds / 60)
      .toString()
      .padStart(2, "0");
    const seconds = (safeSeconds % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  };

  const buildAttachmentFingerprint = (file: File) =>
    [file.name, file.size, file.type, file.lastModified].join(":");

  async function compressImage(file: File): Promise<File> {
    if (!file.type.startsWith("image/")) {
      return file;
    }

    const maxWidth = 1920;
    const maxHeight = 1920;
    const quality = 0.8;

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(img.src);
          resolve(file);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(img.src);
            if (!blob) {
              resolve(file);
              return;
            }
            const compressedFile = new File(
              [blob],
              file.name.replace(/\.[^.]+$/, ".jpg"),
              { type: "image/jpeg", lastModified: Date.now() }
            );
            resolve(compressedFile);
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(img.src);
        resolve(file);
      };
      img.src = URL.createObjectURL(file);
    });
  }

  const updateUploadStatus = (status: AttachmentUploadStatus) => {
    setUploadStatus(status);
    onAttachmentUploadStatusChange?.(status);
  };

  const addAttachments = (
    candidateFiles: Array<{ file: File; durationSeconds?: number | null }>
  ) => {
    if (candidateFiles.length === 0) {
      return;
    }

    const oversized = candidateFiles.filter((item) => item.file.size > MAX_FILE_SIZE);
    if (oversized.length > 0) {
      setFeedback(t('child.checkin.fileTooLarge', { maxSizeMB: MAX_FILE_SIZE / 1024 / 1024 }));
      setSubmissionState("error");
      return;
    }

    setUploadStatus(null);
    const expectedType = homework.required_checkpoint_type;
    const nextAttachments = candidateFiles
      .map(({ file, durationSeconds }) => ({
        type: file.type.startsWith("image/") ? "photo" : "audio",
        file,
        previewUrl: typeof URL !== "undefined" ? URL.createObjectURL(file) : "",
        durationSeconds: durationSeconds ?? null,
      }))
      .filter((attachment) =>
        expectedType ? attachment.type === expectedType : true
      );

    if (candidateFiles.length > 0 && nextAttachments.length !== candidateFiles.length) {
      setFeedback(
        expectedType === "photo"
          ? t('child.checkin.typeMismatchPhoto')
          : t('child.checkin.typeMismatchAudio')
      );
      setSubmissionState("error");
      return;
    }

    const nextAudioAttachment = nextAttachments.find(
      (attachment) => attachment.type === "audio"
    );

    // Audio: replace previous audio attachment; revoke old preview
    if (nextAudioAttachment) {
      attachments
        .filter((prev) => prev.type === "audio")
        .forEach((prev) => {
          if (prev.previewUrl) URL.revokeObjectURL(prev.previewUrl);
        });
      setAttachments([
        ...attachments.filter((prev) => prev.type !== "audio"),
        nextAudioAttachment,
      ]);
      setFeedback(t('child.checkin.recordingSaved'));
      setSubmissionState("success");
      return;
    }

    // Photo: deduplicate by fingerprint
    const existingFingerprints = new Set(
      attachments.map((prev) => buildAttachmentFingerprint(prev.file))
    );
    const uniqueAttachments = nextAttachments.filter((attachment) => {
      const fingerprint = buildAttachmentFingerprint(attachment.file);
      if (existingFingerprints.has(fingerprint)) return false;
      existingFingerprints.add(fingerprint);
      return true;
    });

    if (uniqueAttachments.length !== nextAttachments.length) {
      setFeedback(t('child.checkin.fileAlreadyAdded'));
      setSubmissionState("error");
    } else {
      setFeedback(
        expectedType === "audio"
          ? t('child.checkin.recordingSaved')
          : t('child.checkin.photoAddedFeedback')
      );
      setSubmissionState("success");
    }

    setAttachments((prev) => [...prev, ...uniqueAttachments]);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length > 0) {
      setFeedback(t('child.checkin.compressImage'));
      setSubmissionState("submitting");
    }

    const processed = await Promise.all(
      files.map(async (file) => ({
        file: file.type.startsWith("image/") ? await compressImage(file) : file,
      }))
    );

    addAttachments(processed);
    e.target.value = "";
  };

  const handleAudioRecord = async () => {
    if (recording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      return;
    }

    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setFeedback(t('child.checkin.audioNotSupported'));
      setSubmissionState("error");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = stream;
      const recordingFormat = resolveAudioRecordingFormat();
      const mediaRecorder = recordingFormat.mimeType
        ? new MediaRecorder(stream, {
            mimeType: recordingFormat.mimeType,
            audioBitsPerSecond: AUDIO_RECORDING_BITS_PER_SECOND,
          })
        : new MediaRecorder(stream, {
            audioBitsPerSecond: AUDIO_RECORDING_BITS_PER_SECOND,
          });
      mediaRecorderRef.current = mediaRecorder;
      recordingChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const finalMimeType =
          mediaRecorder.mimeType || recordingFormat.mimeType || "audio/webm";
        const blob = new Blob(recordingChunksRef.current, { type: finalMimeType });
        const durationSeconds =
          recordingStartedAtRef.current == null
            ? recordingElapsedSeconds
            : Math.max(
                1,
                Math.floor((Date.now() - recordingStartedAtRef.current) / 1000)
              );
        const file = new File(
          [blob],
          `recording-${Date.now()}.${recordingFormat.extension}`,
          {
            type: finalMimeType,
            lastModified: Date.now(),
          }
        );
        addAttachments([{ file, durationSeconds }]);
        recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
        mediaRecorderRef.current = null;
        recordingChunksRef.current = [];
        setRecording(false);
        setRecordingElapsedSeconds(durationSeconds);
        setRecordingStartedAt(null);
        recordingStartedAtRef.current = null;
      };

      mediaRecorder.start();
      const startedAt = Date.now();
      recordingStartedAtRef.current = startedAt;
      setRecordingStartedAt(startedAt);
      setRecordingElapsedSeconds(0);
      setRecording(true);
      setFeedback(t('child.checkin.recordingHint'));
      setSubmissionState("idle");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t('child.checkin.recordingFailed'));
      setSubmissionState("error");
      setRecording(false);
    }
  };

  const typeLabelFn = (type: string) =>
    type === "photo" ? t('child.checkin.labelPhoto') : t('child.checkin.labelAudio');

  const uploadAttachmentsToCheckIn = async (
    checkInId: string,
    sessionUserId: string
  ): Promise<boolean> => {
    const mainAttachmentType = attachments[0]?.type ?? "audio";
    const typeLabel = typeLabelFn(mainAttachmentType);

    updateUploadStatus({
      homeworkId: homework.id,
      checkInId,
      state: "uploading",
      progress: 10,
      message: t('child.checkin.uploading', { type: typeLabel }),
    });
    setFeedback(t('child.checkin.uploadingWait', { type: typeLabel }));

    const storageUploads = await Promise.all(
      attachments.map(async (attachment) => {
        const storagePath = `${sessionUserId}/${checkInId}/${Date.now()}_${attachment.file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("attachments")
          .upload(storagePath, attachment.file);
        return { attachment, storagePath, uploadError };
      })
    );

    const failedUpload = storageUploads.find((r) => r.uploadError);
    if (failedUpload) {
      updateUploadStatus({
        homeworkId: homework.id,
        checkInId,
        state: "failed",
        progress: 30,
        message: t('child.checkin.uploadFailed', { type: typeLabel, error: failedUpload.uploadError!.message }),
      });
      setFeedback(
        t('child.checkin.recordedButUploadFailed', { type: typeLabel, error: failedUpload.uploadError!.message })
      );
      setSubmissionState("error");
      return false;
    }

    for (let index = 0; index < storageUploads.length; index++) {
      const { attachment, storagePath } = storageUploads[index];
      const dbProgress =
        Math.round((index / storageUploads.length) * 50) + 30;

      updateUploadStatus({
        homeworkId: homework.id,
        checkInId,
        state: "uploading",
        progress: dbProgress,
        message: t('child.checkin.saving', { type: typeLabel }),
      });

      const { data: insertedAttachment, error: insertAttachmentError } =
        await supabase
          .from("attachments")
          .insert({
            check_in_id: checkInId,
            type: attachment.type,
            storage_path: storagePath,
          })
          .select()
          .single();

      if (insertAttachmentError) {
        updateUploadStatus({
          homeworkId: homework.id,
          checkInId,
          state: "failed",
          progress: Math.min(95, dbProgress + 20),
          message: t('child.checkin.saveFailed', { type: typeLabel, error: insertAttachmentError.message }),
        });
        setFeedback(
          t('child.checkin.recordedButSaveFailed', { type: typeLabel, error: insertAttachmentError.message })
        );
        setSubmissionState("error");
        return false;
      }

      if (attachment.type === "audio" && insertedAttachment) {
        const voicePushTask = buildVoicePushTaskPayload({
          childId: homework.child_id,
          homeworkId: homework.id,
          checkInId: checkInId,
          attachmentId: insertedAttachment.id,
          storagePath,
        });

        void createVoicePushTask({
          supabase: supabase as any,
          task: {
            childId: voicePushTask.childId,
            homeworkId: voicePushTask.homeworkId,
            checkInId: voicePushTask.checkInId,
            attachmentId: voicePushTask.attachmentId,
            filePath: voicePushTask.filePath,
          },
        }).catch((err) => {
          console.error("Voice push task creation failed:", err);
        });
      }
    }

    updateUploadStatus({
      homeworkId: homework.id,
      checkInId,
      state: "uploaded",
      progress: 100,
      message: t('child.checkin.saved', { type: typeLabel }),
    });
    setFeedback(t('child.checkin.saved', { type: typeLabel }));
    setSubmissionState("success");
    return true;
  };

  const handleSubmit = async () => {
    if (loading || submittingRef.current) {
      return;
    }

    if (recording) {
      setFeedback(t('child.checkin.stopBeforeSubmit'));
      setSubmissionState("error");
      return;
    }

    if (homework.required_checkpoint_type && attachments.length === 0) {
      setFeedback(
        homework.required_checkpoint_type === "photo"
          ? t('child.checkin.addPhotoBeforeSubmit')
          : t('child.checkin.addAudioBeforeSubmit')
      );
      setSubmissionState("error");
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    setFeedback(t('child.checkin.submitting'));
    setSubmissionState("submitting");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setFeedback(t('child.checkin.pleaseLogin'));
        setSubmissionState("error");
        setLoading(false);
        submittingRef.current = false;
        return;
      }

      let checkInId = createdCheckInId;
      let checkInData: CheckIn | undefined;

      if (!checkInId) {
        const response = await fetch("/api/check-ins/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            homeworkId: homework.id,
            targetDate: targetDate ?? new Date().toISOString().split("T")[0],
            note,
            proofType: attachments[0]?.type ?? null,
            audioDurationSeconds:
              attachments.find((attachment) => attachment.type === "audio")
                ?.durationSeconds ?? null,
          }),
        });

        const result = await response.json();

        if (!response.ok || !result.checkIn) {
          setFeedback(result.error || t('child.checkin.checkinFailed'));
          setSubmissionState("error");
          setLoading(false);
          submittingRef.current = false;
          return;
        }

        checkInData = result.checkIn;
        checkInId = (checkInData as CheckIn).id;
        setCreatedCheckInId(checkInId);
      }

      if (attachments.length > 0 && checkInId) {
        const uploadSucceeded = await uploadAttachmentsToCheckIn(
          checkInId,
          session.user.id
        ).catch((error) => {
          const typeLabel = typeLabelFn(attachments[0]?.type ?? "audio");
          updateUploadStatus({
            homeworkId: homework.id,
            checkInId,
            state: "failed",
            progress: 20,
            message:
              error instanceof Error
                ? error.message
                : t('child.checkin.uploadFailed', { type: typeLabel, error: t('common.retry') }),
          });
          setFeedback(
            error instanceof Error
              ? error.message
              : t('child.checkin.uploadFailed', { type: typeLabel, error: t('common.retry') })
          );
          setSubmissionState("error");
          return false;
        });

        if (!uploadSucceeded) {
          setLoading(false);
          submittingRef.current = false;
          return;
        }
      }

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("child-points-changed"));
      }

      setLoading(false);
      submittingRef.current = false;
      onSuccess(checkInData);
      onClose();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t('child.checkin.checkinFailed'));
      setSubmissionState("error");
      setLoading(false);
      submittingRef.current = false;
    }
  };

  const handleRetryUpload = async () => {
    if (!createdCheckInId || loading || submittingRef.current) {
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    setFeedback(t('child.checkin.retryingUpload'));
    setSubmissionState("submitting");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setFeedback(t('child.checkin.pleaseLogin'));
        setSubmissionState("error");
        setLoading(false);
        submittingRef.current = false;
        return;
      }

      const uploadSucceeded = await uploadAttachmentsToCheckIn(
        createdCheckInId,
        session.user.id
      ).catch((error) => {
        setFeedback(
          error instanceof Error ? error.message : t('child.checkin.attachmentFailed')
        );
        setSubmissionState("error");
        return false;
      });

      setLoading(false);
      submittingRef.current = false;

      if (uploadSucceeded) {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("child-points-changed"));
        }
        onSuccess();
        onClose();
      }
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : t('child.checkin.attachmentFailed')
      );
      setSubmissionState("error");
      setLoading(false);
      submittingRef.current = false;
    }
  };

  const requiredProofLabel =
    homework.required_checkpoint_type === "photo"
      ? t('child.checkin.labelPhoto')
      : homework.required_checkpoint_type === "audio"
        ? t('child.checkin.labelAudio')
        : "";
  const canSubmit =
    !loading &&
    !recording &&
    (!homework.required_checkpoint_type || attachments.length > 0);

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={t('child.checkin.title')}>
      <div className="space-y-3">
        <div className="text-center">
          <span className="text-5xl">{homework.type_icon}</span>
          <h3 className="text-lg font-bold text-forest-700 mt-2">
            {homework.title}
          </h3>
          <p className="text-primary font-semibold">{t('child.checkin.points', { points: homework.point_value })}</p>
          {homework.required_checkpoint_type && (
            <p className="mt-2 text-sm text-ink-500">
              {t('child.checkin.proofRequired', { proof: requiredProofLabel })}
            </p>
          )}
          {homework.required_checkpoint_type === "photo" && (
            <p className="mt-1 text-xs text-ink-400">
              {t('child.checkin.photoHint')}
            </p>
          )}
        </div>

        {/* Attachment buttons */}
        <div className="flex gap-3 justify-center">
          <input
            ref={fileInputRef}
            type="file"
            accept={homework.required_checkpoint_type === "audio" ? "audio/*" : "image/*"}
            multiple={homework.required_checkpoint_type !== "audio"}
            className="hidden"
            onChange={handleFileSelect}
            disabled={loading}
          />
          <Button
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
          >
            {homework.required_checkpoint_type === "audio" ? t('child.checkin.uploadAudio') : t('child.checkin.addPhoto')}
          </Button>
          {(homework.required_checkpoint_type === "audio" ||
            !homework.required_checkpoint_type) && (
            <Button
              variant="secondary"
              onClick={handleAudioRecord}
              disabled={loading}
            >
              {recording ? t('child.checkin.stopRecording') : t('child.checkin.startRecording')}
            </Button>
          )}
        </div>

        {recording ? (
          <p className="text-center text-sm font-medium text-primary">
            {t('child.checkin.recordingInProgress', { duration: formatDuration(recordingElapsedSeconds) })}
          </p>
        ) : null}

        {recording ? (
          <p className="text-center text-xs text-honey-500">
            {t('child.checkin.stopBeforeSubmit')}
          </p>
        ) : null}

        {homework.required_checkpoint_type && attachments.length === 0 ? (
          <p className="text-center text-xs text-coral-500">
            {t('child.checkin.addProof', { proof: requiredProofLabel })}
          </p>
        ) : null}

        {/* Attachment preview */}
        {attachments.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {attachments.map((att, index) => (
              <div
                key={`${att.file.name}-${index}`}
                className={`rounded-xl border border-cream-200 bg-cream-50/70 p-2 ${att.type === "audio" ? "col-span-2" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-forest-700">
                      {att.type === "photo" ? t('child.checkin.addedPhoto') : t('child.checkin.addedAudio')}
                    </p>
                    {att.type === "audio" && att.durationSeconds != null ? (
                      <p className="mt-1 text-xs text-ink-500">
                        {t('child.checkin.duration', { duration: formatDuration(att.durationSeconds) })}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setAttachments((prev) => {
                        const next = [...prev];
                        const [removed] = next.splice(index, 1);
                        if (removed?.previewUrl) {
                          URL.revokeObjectURL(removed.previewUrl);
                        }
                        return next;
                      });
                      setFeedback(
                        homework.required_checkpoint_type === "audio"
                          ? t('child.checkin.addAudioBeforeSubmit')
                          : t('child.checkin.addPhotoBeforeSubmit')
                      );
                      setSubmissionState("idle");
                    }}
                    className="shrink-0 text-coral-500 hover:bg-coral-50 hover:text-coral-600"
                  >
                    {att.type === "photo" ? t('child.checkin.delete') : t('child.checkin.deleteReRecord')}
                  </Button>
                </div>

                {att.type === "photo" ? (
                  <div className="mt-2 aspect-square w-full overflow-hidden rounded-lg bg-cream-100">
                    <img
                      src={att.previewUrl}
                      alt={att.file.name}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <AudioPlayer
                    src={att.previewUrl}
                    className="mt-2 w-full"
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Note */}
        <div>
          <label className="block text-sm font-medium text-forest-700 mb-1">
            {t('child.checkin.noteLabel')}
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('child.checkin.notePlaceholder')}
            className="w-full px-4 py-3 rounded-xl border-2 border-cream-200 focus:border-primary focus:outline-none"
            rows={2}
            disabled={loading}
          />
        </div>

        {/* Celebration sparkles — shown on success */}
        {submissionState === "success" && (
          <div className="relative h-10" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <svg
                key={i}
                viewBox="0 0 24 24"
                fill="currentColor"
                className="absolute animate-star-burst text-honey-400"
                style={{
                  left: `${12 + i * 20}%`,
                  top: -4,
                  width: 20 + (i % 3) * 6,
                  height: 20 + (i % 3) * 6,
                  animationDelay: `${i * 0.06}s`,
                }}
              >
                <path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5z" />
              </svg>
            ))}
          </div>
        )}

        {feedback && (
          <p
            className={`rounded-xl px-3 py-2 text-sm ${
              submissionState === "submitting"
                ? "bg-sky-50 text-sky-700"
                : submissionState === "error"
                ? "bg-coral-50 text-coral-700"
                : submissionState === "success"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-cream-50 text-forest-700"
            }`}
          >
            {feedback}
          </p>
        )}

        {uploadStatus ? (
          <div className="rounded-xl bg-cream-50 p-2.5">
            <div className="flex items-center justify-between gap-3 text-xs font-medium">
              <span
                className={
                  uploadStatus.state === "failed"
                    ? "text-coral-600"
                    : uploadStatus.state === "uploaded"
                      ? "text-primary"
                      : "text-forest-600"
                }
              >
                {uploadStatus.message ||
                  (uploadStatus.state === "failed"
                    ? t('child.checkin.statusFailed')
                    : uploadStatus.state === "uploaded"
                      ? t('child.checkin.statusUploaded')
                      : t('child.checkin.statusUploading'))}
              </span>
              <span className="text-ink-500">
                {Math.round(uploadStatus.progress)}%
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-cream-50">
              <div
                className={`h-full rounded-full transition-all ${
                  uploadStatus.state === "failed" ? "bg-coral-400" : "bg-primary"
                }`}
                style={{
                  width: `${Math.max(0, Math.min(100, uploadStatus.progress))}%`,
                }}
              />
            </div>
          </div>
        ) : null}

        {/* Unsaved changes confirmation */}
        {unsavedConfirmPending && (
          <div className="rounded-xl border-2 border-coral-200 bg-coral-50 p-4 text-center">
            <p className="text-sm font-medium text-coral-700">
              {t('child.checkin.unsavedConfirm')}
            </p>
            <div className="mt-3 flex gap-3 justify-center">
              <Button
                variant="ghost"
                onClick={() => setUnsavedConfirmPending(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button
                variant="default"
                onClick={() => {
                  setUnsavedConfirmPending(false);
                  onClose();
                }}
              >
                {t('common.confirm')}
              </Button>
            </div>
          </div>
        )}

        {/* Submit */}
        <Button className="w-full" onClick={handleSubmit} disabled={!canSubmit}>
          {loading
            ? t('child.checkin.submitting')
            : createdCheckInId
              ? t('child.checkin.resubmit')
              : t('child.checkin.confirmComplete')}
        </Button>
        {createdCheckInId && submissionState === "error" && (
          <Button
            variant="secondary"
            className="w-full"
            onClick={handleRetryUpload}
            disabled={loading || attachments.length === 0}
          >
            {t('child.checkin.retryUpload')}
          </Button>
        )}
      </div>
    </Modal>
  );
}
