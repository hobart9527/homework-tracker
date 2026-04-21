"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { buildVoicePushTaskPayload } from "@/lib/family-notifications";
import { createVoicePushTask } from "@/lib/voice-push-tasks";
import type { Database } from "@/lib/supabase/types";

type Homework = Database["public"]["Tables"]["homeworks"]["Row"];

interface CheckInModalProps {
  homework: Homework;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CheckInModal({
  homework,
  isOpen,
  onClose,
  onSuccess,
}: CheckInModalProps) {
  const supabase = createClient();
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const submittingRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [submissionState, setSubmissionState] = useState<
    "idle" | "submitting" | "error" | "success"
  >("idle");
  const [attachments, setAttachments] = useState<
    { type: string; file: File; previewUrl: string }[]
  >([]);
  const [note, setNote] = useState("");
  const [recording, setRecording] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      submittingRef.current = false;
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
    };
  }, [attachments]);

  const buildAttachmentFingerprint = (file: File) =>
    [file.name, file.size, file.type, file.lastModified].join(":");

  const addAttachments = (candidateFiles: File[]) => {
    if (candidateFiles.length === 0) {
      return;
    }

    const expectedType = homework.required_checkpoint_type;
    const nextAttachments = candidateFiles
      .map((file) => ({
        type: file.type.startsWith("image/") ? "photo" : "audio",
        file,
        previewUrl: typeof URL !== "undefined" ? URL.createObjectURL(file) : "",
      }))
      .filter((attachment) =>
        expectedType ? attachment.type === expectedType : true
      );

    if (candidateFiles.length > 0 && nextAttachments.length !== candidateFiles.length) {
      setFeedback(
        expectedType === "photo"
          ? "这项作业需要上传照片，当前文件类型不匹配"
          : "这项作业需要上传录音，当前文件类型不匹配"
      );
      setSubmissionState("error");
      return;
    }

    setAttachments((prev) => {
      const existingFingerprints = new Set(
        prev.map((attachment) => buildAttachmentFingerprint(attachment.file))
      );
      const uniqueAttachments = nextAttachments.filter((attachment) => {
        const fingerprint = buildAttachmentFingerprint(attachment.file);
        if (existingFingerprints.has(fingerprint)) {
          return false;
        }

        existingFingerprints.add(fingerprint);
        return true;
      });

      if (uniqueAttachments.length !== nextAttachments.length) {
        setFeedback("这个文件已经添加过了");
        setSubmissionState("error");
      } else {
        setFeedback(
          expectedType === "audio"
            ? "录音已保存，可以试听后再提交"
            : "照片已添加，可以确认后再提交"
        );
        setSubmissionState("success");
      }

      return [...prev, ...uniqueAttachments];
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    addAttachments(files);
    e.target.value = "";
  };

  const handleAudioRecord = async () => {
    if (recording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      return;
    }

    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setFeedback("当前设备不支持直接录音，请改用上传录音文件");
      setSubmissionState("error");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      recordingChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(recordingChunksRef.current, { type: "audio/webm" });
        const file = new File([blob], `recording-${Date.now()}.webm`, {
          type: "audio/webm",
          lastModified: Date.now(),
        });
        addAttachments([file]);
        recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
        mediaRecorderRef.current = null;
        recordingChunksRef.current = [];
        setRecording(false);
      };

      mediaRecorder.start();
      setRecording(true);
      setFeedback("录音中，点一次“停止录音”保存");
      setSubmissionState("idle");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "录音启动失败，请检查麦克风权限");
      setSubmissionState("error");
      setRecording(false);
    }
  };

  const handleSubmit = async () => {
    if (loading || submittingRef.current) {
      return;
    }

    if (homework.required_checkpoint_type && attachments.length === 0) {
      setFeedback(
        homework.required_checkpoint_type === "photo"
          ? "请先添加照片后再提交"
          : "请先添加录音后再提交"
      );
      setSubmissionState("error");
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    setFeedback("正在保存打卡记录...");
    setSubmissionState("submitting");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setFeedback("请先重新登录后再试");
        setSubmissionState("error");
        setLoading(false);
        submittingRef.current = false;
        return;
      }

      const response = await fetch("/api/check-ins/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homeworkId: homework.id,
          note,
          proofType: attachments[0]?.type ?? null,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.checkIn) {
        setFeedback(result.error || "打卡失败，请重试");
        setSubmissionState("error");
        setLoading(false);
        submittingRef.current = false;
        return;
      }

      const checkIn = result.checkIn;

      if (attachments.length > 0) {
        let attachmentUploadFailed = false;

        for (const attachment of attachments) {
          const storagePath = `${session.user.id}/${checkIn.id}/${Date.now()}_${attachment.file.name}`;

          const { error: uploadError } = await supabase.storage
            .from("attachments")
            .upload(storagePath, attachment.file);

          if (uploadError) {
            attachmentUploadFailed = true;
            break;
          }

          const { data: insertedAttachment, error: insertAttachmentError } = await supabase
            .from("attachments")
            .insert({
              check_in_id: checkIn.id,
              type: attachment.type,
              storage_path: storagePath,
            })
            .select()
            .single();

          if (insertAttachmentError) {
            attachmentUploadFailed = true;
            break;
          }

          if (attachment.type === "audio" && insertedAttachment) {
            const voicePushTask = buildVoicePushTaskPayload({
              childId: homework.child_id,
              homeworkId: homework.id,
              checkInId: checkIn.id,
              attachmentId: insertedAttachment.id,
              storagePath,
            });

            try {
              await createVoicePushTask({
                supabase: supabase as any,
                task: {
                  childId: voicePushTask.childId,
                  homeworkId: voicePushTask.homeworkId,
                  checkInId: voicePushTask.checkInId,
                  attachmentId: voicePushTask.attachmentId,
                  filePath: voicePushTask.filePath,
                },
              });
            } catch {
              // Voice push is a beta side-channel and must not block homework completion.
            }
          }
        }

        if (attachmentUploadFailed) {
          setFeedback("作业已记录，但附件上传失败，请稍后重新提交");
          setSubmissionState("error");
          setLoading(false);
          submittingRef.current = false;
          onSuccess();
          return;
        }
      }

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("child-points-changed"));
      }

      setLoading(false);
      submittingRef.current = false;
      onSuccess();
      onClose();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "打卡失败，请重试");
      setSubmissionState("error");
      setLoading(false);
      submittingRef.current = false;
    }
  };

  const requiredProofLabel =
    homework.required_checkpoint_type === "photo"
      ? "照片"
      : homework.required_checkpoint_type === "audio"
        ? "录音"
        : null;
  const canSubmit =
    !loading &&
    (!homework.required_checkpoint_type || attachments.length > 0);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="完成作业">
      <div className="space-y-4">
        <div className="text-center">
          <span className="text-5xl">{homework.type_icon}</span>
          <h3 className="text-lg font-bold text-forest-700 mt-2">
            {homework.title}
          </h3>
          <p className="text-primary font-semibold">+{homework.point_value} 积分</p>
          {homework.required_checkpoint_type && (
            <p className="mt-2 text-sm text-forest-500">
              需要{requiredProofLabel}
            </p>
          )}
          {homework.required_checkpoint_type === "photo" && (
            <p className="mt-1 text-xs text-forest-400">
              可以拍照，或上传已有图片
            </p>
          )}
        </div>

        {/* Attachment buttons */}
        <div className="flex gap-2 justify-center">
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
            {homework.required_checkpoint_type === "audio" ? "🎵 上传录音" : "📷 添加照片"}
          </Button>
          {(homework.required_checkpoint_type === "audio" ||
            !homework.required_checkpoint_type) && (
            <Button
              variant="secondary"
              onClick={handleAudioRecord}
              disabled={loading}
            >
              {recording ? "⏹️ 停止录音" : "🎤 录音"}
            </Button>
          )}
        </div>

        {homework.required_checkpoint_type && attachments.length === 0 ? (
          <p className="text-center text-xs text-rose-500">
            请先添加{requiredProofLabel}，再提交本次作业
          </p>
        ) : null}

        {/* Attachment preview */}
        {attachments.length > 0 && (
          <div className="space-y-3">
            {attachments.map((att, index) => (
              <div
                key={`${att.file.name}-${index}`}
                className="rounded-2xl border border-forest-100 bg-forest-50/70 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-forest-700">
                      {att.file.name}
                    </p>
                    <p className="mt-1 text-xs text-forest-500">
                      {att.type === "photo" ? "已添加照片" : "已添加录音"}
                    </p>
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
                          ? "请先添加录音，再提交本次作业"
                          : "请先添加照片，再提交本次作业"
                      );
                      setSubmissionState("idle");
                    }}
                    className="shrink-0 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                  >
                    删除重录
                  </Button>
                </div>

                {att.type === "photo" ? (
                  <img
                    src={att.previewUrl}
                    alt={att.file.name}
                    className="mt-3 h-32 w-full rounded-xl object-cover"
                  />
                ) : (
                  <audio
                    src={att.previewUrl}
                    controls
                    className="mt-3 w-full"
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Note */}
        <div>
          <label className="block text-sm font-medium text-forest-700 mb-1">
            备注（可选）
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="可以写点备注..."
            className="w-full px-4 py-2 rounded-xl border-2 border-forest-200 focus:border-primary focus:outline-none"
            rows={2}
            disabled={loading}
          />
        </div>

        {feedback && (
          <p
            className={`rounded-xl px-4 py-3 text-sm ${
              submissionState === "submitting"
                ? "bg-sky-50 text-sky-700"
                : submissionState === "error"
                ? "bg-rose-50 text-rose-700"
                : submissionState === "success"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-forest-50 text-forest-700"
            }`}
          >
            {feedback}
          </p>
        )}

        {/* Submit */}
        <Button className="w-full" onClick={handleSubmit} disabled={!canSubmit}>
          {loading ? "提交中..." : "确认完成 ✨"}
        </Button>
      </div>
    </Modal>
  );
}
