"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { Card } from "@/components/ui/Card";
import { IconStar, IconClock, IconMapPin, IconPaperclip, IconBookOpen } from "@/components/ui/icons";
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
  const router = useRouter();
  const locale = useLocale();
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
        className={`${isCompleted ? "bg-cream-50 border-2 border-primary" : ""} ${
          isOverdue && !isCompleted ? "border-2 border-coral-500" : ""
        }`}
      >
        {/* 主布局：移动端垂直排列，桌面端水平排列 */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {/* 左侧：图标 + 内容 */}
          <div className="flex min-w-0 flex-1 gap-3 sm:gap-4">
            {/* 图标 */}
            <span className="text-3xl sm:text-4xl leading-none shrink-0">{homework.type_icon}</span>

            {/* 文字内容 */}
            <div className="min-w-0 flex-1">
              {/* 标题行：标题 + 状态徽章 */}
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate font-semibold text-forest-700">{homework.title}</h3>
                {isOverdue && !isCompleted ? (
                  <span className="rounded-full bg-coral-50 px-2.5 py-0.5 text-xs font-medium text-coral-500 shadow-elevation-raised shrink-0">
                    已超时
                  </span>
                ) : !isCompleted ? (
                  <span className="rounded-full bg-cream-100/80 px-2.5 py-0.5 text-xs font-medium text-forest-600 shadow-elevation-raised shrink-0">
                    待完成
                  </span>
                ) : null}
              </div>

              {/* Meta 行：时间 + 积分 */}
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs sm:text-sm text-ink-500">
                {homework.estimated_minutes != null ? (
                  <span className="rounded-full bg-cream-100/80 px-2.5 py-0.5 shadow-elevation-raised shrink-0 inline-flex items-center gap-1">
                    <IconClock className="w-3.5 h-3.5" /> {homework.estimated_minutes}分钟
                  </span>
                ) : null}
                <span className="rounded-full bg-cream-100/80 px-2.5 py-0.5 shadow-elevation-raised shrink-0 inline-flex items-center gap-1">
                  <IconStar className="w-3.5 h-3.5" /> {homework.point_value}积分
                </span>
              </div>

              {/* 截止时间 & 附件提示 */}
              {homework.daily_cutoff_time && (
                <p className="mt-1.5 text-xs text-ink-400 inline-flex items-center gap-1"><IconMapPin className="w-3 h-3" /> 截止 {homework.daily_cutoff_time}</p>
              )}
              {homework.required_checkpoint_type && attachments.length === 0 && (
                <p className="mt-0.5 text-xs text-ink-400">
                  需要 {homework.required_checkpoint_type === "photo" ? "照片" : "录音"}
                </p>
              )}

              {/* 查看附件按钮 */}
              {shouldShowAttachmentEntry && (
                <button
                  type="button"
                  onClick={() => void handleViewAttachments()}
                  className="mt-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary shadow-elevation-raised transition hover:bg-primary/15"
                >
                  <IconPaperclip className="w-4 h-4" /> 查看已提交附件
                </button>
              )}

              {/* 上传进度条 */}
              {attachmentUploadStatus && attachmentUploadStatus.state !== "uploaded" ? (
                <div className="mt-3 rounded-radius-lg bg-cream-50 p-3">
                  <div className="flex items-center justify-between gap-3 text-xs font-medium">
                    <span
                      className={
                        attachmentUploadStatus.state === "failed"
                          ? "text-coral-600"
                          : "text-forest-600"
                      }
                    >
                      {attachmentUploadStatus.message ||
                        (attachmentUploadStatus.state === "failed"
                          ? "录音上传失败"
                          : "录音上传中")}
                    </span>
                    <span className="text-ink-500">
                      {Math.round(attachmentUploadStatus.progress)}%
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                    <div
                      className={`h-full rounded-full transition-all ${
                        attachmentUploadStatus.state === "failed"
                          ? "bg-coral-400"
                          : "bg-primary"
                      }`}
                      style={{
                        width: `${Math.max(0, Math.min(100, attachmentUploadStatus.progress))}%`,
                      }}
                    />
                  </div>
                </div>
              ) : null}

              {/* 状态文字 */}
              {shouldShowStatusText && (
                <p className="mt-1 text-xs font-medium text-ink-500">{statusText}</p>
              )}
            </div>
          </div>

          {/* 右侧：操作按钮 / 完成状态 */}
          <div className="shrink-0 w-full sm:w-auto flex items-center justify-end">
            {isCompleted ? (
              <div className="rounded-xl bg-primary/10 px-4 py-2 text-center text-base font-bold text-primary shadow-elevation-raised inline-flex items-center gap-1">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-5 h-5"><polyline points="20 6 9 17 4 12"/></svg> 完成
              </div>
            ) : isOverdue ? (
              <Button
                variant="accent"
                size="md"
                onClick={homework.type_icon === "📚" ? () => router.push(`/${locale}/reading`) : onComplete}
                className="min-h-[44px] w-full sm:w-auto"
              >
                {homework.type_icon === "📚" ? "去阅读" : "补打卡"}
              </Button>
            ) : (
              <Button
                size="md"
                onClick={homework.type_icon === "📚" ? () => router.push(`/${locale}/reading`) : onComplete}
                className="min-h-[44px] w-full sm:w-auto"
              >
                {homework.type_icon === "📚" ? "去阅读" : "完成"}
              </Button>
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
                loading="lazy"
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
