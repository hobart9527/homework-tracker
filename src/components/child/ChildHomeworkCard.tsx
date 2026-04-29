"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { AudioPlayer } from "@/components/ui/AudioPlayer";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

type Homework = Database["public"]["Tables"]["homeworks"]["Row"];
type Attachment = Database["public"]["Tables"]["attachments"]["Row"];
type AttachmentPreview = { type: "photo" | "audio"; url: string };

interface ChildHomeworkCardProps {
  homework: Homework;
  isCompleted: boolean;
  isOverdue: boolean;
  isRepeatSubmission?: boolean;
  latestCheckInId?: string | null;
  latestProofType?: "photo" | "audio" | null;
  attachmentUploadStatus?: {
    checkInId: string;
    state: "uploading" | "uploaded" | "failed";
    progress: number;
    message?: string;
  };
  statusText?: string;
  onComplete: () => void;
}

export function ChildHomeworkCard({
  homework,
  isCompleted,
  isOverdue,
  isRepeatSubmission = false,
  latestCheckInId = null,
  latestProofType = null,
  attachmentUploadStatus,
  statusText,
  onComplete,
}: ChildHomeworkCardProps) {
  const proofLabel = {
    photo: "照片",
    audio: "录音",
  } as const;
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [previewUrls, setPreviewUrls] = useState<AttachmentPreview[]>([]);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const getSupabase = () => {
    if (!supabaseRef.current) {
      supabaseRef.current = createClient();
    }

    return supabaseRef.current;
  };

  const attachmentCheckInId = latestCheckInId ?? attachmentUploadStatus?.checkInId ?? null;
  const storedProofType = homework.required_checkpoint_type ?? latestProofType;
  const shouldLoadAttachments =
    Boolean(storedProofType) ||
    Boolean(attachmentCheckInId) ||
    attachmentUploadStatus?.state === "uploaded";

  useEffect(() => {
    let ignore = false;

    async function loadAttachments() {
      if (!attachmentCheckInId || !isCompleted || !shouldLoadAttachments) {
        if (!ignore) {
          setAttachments([]);
        }
        return;
      }

      const { data } = await getSupabase()
        .from("attachments")
        .select("*")
        .eq("check_in_id", attachmentCheckInId);

      if (!ignore) {
        setAttachments(data || []);
      }
    }

    void loadAttachments();

    return () => {
      ignore = true;
    };
  }, [
    attachmentCheckInId,
    attachmentUploadStatus?.state,
    homework.required_checkpoint_type,
    isCompleted,
    latestProofType,
    shouldLoadAttachments,
  ]);

  const loadAttachments = async () => {
    if (!attachmentCheckInId) {
      return [];
    }

    const { data } = await getSupabase()
      .from("attachments")
      .select("*")
      .eq("check_in_id", attachmentCheckInId);

    const nextAttachments = data || [];
    setAttachments(nextAttachments);
    return nextAttachments;
  };

  const handleViewAttachments = async () => {
    const attachmentList =
      attachments.length > 0 ? attachments : await loadAttachments();

    if (attachmentList.length === 0) {
      return;
    }

    const results = await Promise.all(
      attachmentList.map(async (attachment) => {
        const { data } = await getSupabase().storage
          .from("attachments")
          .createSignedUrl(attachment.storage_path, 60 * 10);

        return data?.signedUrl
          ? { type: attachment.type, url: data.signedUrl }
          : null;
      })
    );

    setPreviewUrls(
      results.filter(
        (result): result is AttachmentPreview => Boolean(result)
      )
    );
    setIsPreviewOpen(true);
  };

  const shouldShowStatusText =
    Boolean(statusText) && !(isCompleted && statusText === "已完成");
  const shouldShowAttachmentEntry =
    isCompleted &&
    Boolean(attachmentCheckInId) &&
    (Boolean(storedProofType) ||
      attachments.length > 0 ||
      attachmentUploadStatus?.state === "uploaded");
  return (
    <>
      <Card
        className={`${isCompleted ? "bg-forest-50 border-2 border-primary" : ""} ${
          isOverdue && !isCompleted ? "border-2 border-accent" : ""
        }`}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-1 gap-4">
            <span className="text-4xl leading-none">{homework.type_icon}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate font-semibold text-forest-700">{homework.title}</h3>
                {isOverdue && !isCompleted ? (
                  <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-accent">
                    已超时
                  </span>
                ) : !isCompleted ? (
                  <span className="rounded-full bg-forest-100 px-2.5 py-0.5 text-xs font-medium text-forest-600">
                    待完成
                  </span>
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-forest-500">
                {homework.estimated_minutes != null ? (
                  <span className="rounded-full bg-forest-50 px-3 py-1">
                    ⏱️ {homework.estimated_minutes}分钟
                  </span>
                ) : null}
                <span className="rounded-full bg-forest-50 px-3 py-1">⭐ {homework.point_value}积分</span>
              </div>
              {homework.daily_cutoff_time && (
                <p className="mt-2 text-xs text-forest-400">📍 截止 {homework.daily_cutoff_time}</p>
              )}
              {homework.required_checkpoint_type && attachments.length === 0 && (
                <p className="mt-1 text-xs text-forest-400">需要{proofLabel[homework.required_checkpoint_type]}</p>
              )}
              {shouldShowAttachmentEntry && (
                <button
                  type="button"
                  onClick={() => void handleViewAttachments()}
                  className="mt-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary shadow-sm transition hover:bg-primary/15"
                >
                  <span aria-hidden="true">📎</span>
                  查看已提交附件
                </button>
              )}
              {attachmentUploadStatus && attachmentUploadStatus.state !== "uploaded" ? (
                <div className="mt-3 rounded-2xl bg-forest-50 p-3">
                  <div className="flex items-center justify-between gap-3 text-xs font-medium">
                    <span
                      className={
                        attachmentUploadStatus.state === "failed"
                          ? "text-rose-600"
                          : "text-forest-600"
                      }
                    >
                      {attachmentUploadStatus.message ||
                        (attachmentUploadStatus.state === "failed"
                          ? "录音上传失败"
                          : "录音上传中")}
                    </span>
                    <span className="text-forest-500">
                      {Math.round(attachmentUploadStatus.progress)}%
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                    <div
                      className={`h-full rounded-full transition-all ${
                        attachmentUploadStatus.state === "failed"
                          ? "bg-rose-400"
                          : "bg-primary"
                      }`}
                      style={{
                        width: `${Math.max(
                          0,
                          Math.min(100, attachmentUploadStatus.progress)
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              ) : null}
              {shouldShowStatusText && (
                <p className="mt-1 text-xs font-medium text-forest-500">{statusText}</p>
              )}
            </div>
          </div>
          <div className="sm:pt-1">
            {isCompleted ? (
              <div className="rounded-xl bg-primary/10 px-4 py-2 text-center text-lg font-bold text-primary">
                ✓ 完成
              </div>
            ) : isOverdue ? (
              <Button variant="accent" onClick={onComplete}>
                补打卡
              </Button>
            ) : (
              <Button onClick={onComplete}>完成</Button>
            )}
          </div>
        </div>
      </Card>

      <Modal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        title="附件预览"
        size="sm"
      >
        <div className="space-y-3">
          {previewUrls.map((attachment, index) =>
            attachment.type === "photo" ? (
              <img
                key={attachment.url}
                src={attachment.url}
                alt={`${homework.title} 附件 ${index + 1}`}
                className="w-full rounded-2xl object-cover"
              />
            ) : (
              <AudioPlayer
                key={attachment.url}
                src={attachment.url}
                className="w-full"
              />
            )
          )}
        </div>
      </Modal>
    </>
  );
}
