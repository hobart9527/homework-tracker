"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
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
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [submissionState, setSubmissionState] = useState<"idle" | "success" | "error">("idle");
  const [attachments, setAttachments] = useState<{ type: string; file: File }[]>(
    []
  );
  const [note, setNote] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setLoading(false);
      setFeedback("");
      setSubmissionState("idle");
      setAttachments([]);
      setNote("");
    }
  }, [isOpen]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const expectedType = homework.required_checkpoint_type;
    const newAttachments = files
      .map((file) => ({
      type: file.type.startsWith("image/") ? "photo" : "audio",
      file,
      }))
      .filter((attachment) =>
        expectedType ? attachment.type === expectedType : true
      );

    if (files.length > 0 && newAttachments.length !== files.length) {
      setFeedback(
        expectedType === "photo"
          ? "这项作业需要上传照片，当前文件类型不匹配"
          : "这项作业需要上传录音，当前文件类型不匹配"
      );
      setSubmissionState("error");
    } else {
      setFeedback("");
      setSubmissionState("idle");
    }

    setAttachments((prev) => [...prev, ...newAttachments]);
    e.target.value = "";
  };

  const handleAudioRecord = () => {
    // Simplified audio recording using MediaRecorder API
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      const mediaRecorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];

      mediaRecorder.ondataavailable = (e) => {
        chunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        const file = new File([blob], "recording.webm", { type: "audio/webm" });
        setAttachments((prev) => [...prev, { type: "audio", file }]);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setTimeout(() => mediaRecorder.stop(), 5000); // 5 second recording
    });
  };

  const handleSubmit = async () => {
    if (loading || submissionState === "success") {
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

    setLoading(true);
    setFeedback("");
    setSubmissionState("idle");

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setFeedback("请先重新登录后再试");
      setSubmissionState("error");
      setLoading(false);
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
      return;
    }

    const checkIn = result.checkIn;

    let attachmentUploadFailed = false;

    // Upload attachments
    for (const attachment of attachments) {
      const storagePath = `${session.user.id}/${checkIn.id}/${Date.now()}_${attachment.file.name}`;

      const { error: uploadError } = await supabase.storage
        .from("attachments")
        .upload(storagePath, attachment.file);

      if (uploadError) {
        attachmentUploadFailed = true;
        break;
      }

      const { error: insertAttachmentError } = await supabase.from("attachments").insert({
        check_in_id: checkIn.id,
        type: attachment.type,
        storage_path: storagePath,
      });

      if (insertAttachmentError) {
        attachmentUploadFailed = true;
        break;
      }
    }

    if (attachmentUploadFailed) {
      setFeedback("作业已记录，但附件上传失败，请稍后重新提交");
      setSubmissionState("error");
      setLoading(false);
      onSuccess();
      return;
    }

    setFeedback(result.message || "完成成功");
    setSubmissionState("success");
    setLoading(false);
    onSuccess();
  };

  const isSuccess = submissionState === "success";
  const requiredProofLabel =
    homework.required_checkpoint_type === "photo"
      ? "照片"
      : homework.required_checkpoint_type === "audio"
        ? "录音"
        : null;
  const uploadButtonLabel =
    homework.required_checkpoint_type === "audio" ? "上传录音" : "添加照片";
  const canSubmit =
    !loading &&
    !isSuccess &&
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
            disabled={loading || isSuccess}
          />
          <Button
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading || isSuccess}
          >
            {homework.required_checkpoint_type === "audio" ? "🎵 上传录音" : "📷 添加照片"}
          </Button>
          {(homework.required_checkpoint_type === "audio" ||
            !homework.required_checkpoint_type) && (
            <Button
              variant="secondary"
              onClick={handleAudioRecord}
              disabled={loading || isSuccess}
            >
              🎤 录音
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
          <div className="flex gap-2 flex-wrap">
            {attachments.map((att, index) => (
              <div
                key={index}
                className="w-16 h-16 bg-forest-100 rounded-lg flex items-center justify-center text-2xl"
              >
                {att.type === "photo" ? "🖼️" : "🎵"}
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
            disabled={loading || isSuccess}
          />
        </div>

        {feedback && (
          <p
            className={`rounded-xl px-4 py-3 text-sm ${
              isSuccess
                ? "bg-emerald-50 text-emerald-700"
                : "bg-rose-50 text-rose-700"
            }`}
          >
            {feedback}
          </p>
        )}

        {/* Submit */}
        {isSuccess ? (
          <Button className="w-full" onClick={onClose}>
            知道了
          </Button>
        ) : (
          <Button className="w-full" onClick={handleSubmit} disabled={!canSubmit}>
            {loading ? "提交中..." : "确认完成 ✨"}
          </Button>
        )}
      </div>
    </Modal>
  );
}
