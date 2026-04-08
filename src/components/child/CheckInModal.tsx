"use client";

import { useState, useRef } from "react";
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
  const [attachments, setAttachments] = useState<{ type: string; file: File }[]>(
    []
  );
  const [note, setNote] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    setLoading(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    // Create check-in record
    const { data: checkIn, error: checkInError } = await supabase
      .from("check_ins")
      .insert({
        homework_id: homework.id,
        child_id: session.user.id,
        points_earned: homework.point_value,
        note: note || null,
      })
      .select()
      .single();

    if (checkInError || !checkIn) {
      alert("打卡失败，请重试");
      setLoading(false);
      return;
    }

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

    setLoading(false);
    onSuccess();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="完成作业">
      <div className="space-y-4">
        <div className="text-center">
          <span className="text-5xl">{homework.type_icon}</span>
          <h3 className="text-lg font-bold text-forest-700 mt-2">
            {homework.title}
          </h3>
          <p className="text-primary font-semibold">+{homework.point_value} 积分</p>
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
          />
          <Button
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
          >
            📷 拍照/截图
          </Button>
          <Button variant="secondary" onClick={handleAudioRecord}>
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
          />
        </div>

        {/* Submit */}
        <Button
          className="w-full"
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? "提交中..." : "确认完成 ✨"}
        </Button>
      </div>
    </Modal>
  );
}
