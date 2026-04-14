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
    const newAttachments = files.map((file) => ({
      type: file.type.startsWith("image/") ? "photo" : "audio",
      file,
    }));
    setAttachments((prev) => [...prev, ...newAttachments]);
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

    // Upload attachments
    for (const attachment of attachments) {
      const storagePath = `${session.user.id}/${checkIn.id}/${Date.now()}_${attachment.file.name}`;

      const { error: uploadError } = await supabase.storage
        .from("attachments")
        .upload(storagePath, attachment.file);

      if (!uploadError) {
        await supabase.from("attachments").insert({
          check_in_id: checkIn.id,
          type: attachment.type,
          storage_path: storagePath,
        });
      }
    }

    setFeedback(result.message || "完成成功");
    setSubmissionState("success");
    setLoading(false);
    onSuccess();
  };

  const isSuccess = submissionState === "success";

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
              需要
              {homework.required_checkpoint_type === "photo"
                ? "照片"
                : "录音"}
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
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileSelect}
            disabled={loading || isSuccess}
          />
          <Button
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading || isSuccess}
          >
            📷 添加照片
          </Button>
          <Button variant="secondary" onClick={handleAudioRecord} disabled={loading || isSuccess}>
            🎤 录音
          </Button>
        </div>

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
          <Button className="w-full" onClick={handleSubmit} disabled={loading}>
            {loading ? "提交中..." : "确认完成 ✨"}
          </Button>
        )}
      </div>
    </Modal>
  );
}
