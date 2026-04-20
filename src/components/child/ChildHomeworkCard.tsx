"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

type Homework = Database["public"]["Tables"]["homeworks"]["Row"];
type Attachment = Database["public"]["Tables"]["attachments"]["Row"];

interface ChildHomeworkCardProps {
  homework: Homework;
  isCompleted: boolean;
  isOverdue: boolean;
  isRepeatSubmission?: boolean;
  latestCheckInId?: string | null;
  statusText?: string;
  onComplete: () => void;
}

export function ChildHomeworkCard({
  homework,
  isCompleted,
  isOverdue,
  isRepeatSubmission = false,
  latestCheckInId = null,
  statusText,
  onComplete,
}: ChildHomeworkCardProps) {
  const proofLabel = {
    photo: "照片",
    audio: "录音",
  } as const;
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Array<{ type: "photo" | "audio"; url: string }>>([]);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const getSupabase = () => {
    if (!supabaseRef.current) {
      supabaseRef.current = createClient();
    }

    return supabaseRef.current;
  };

  useEffect(() => {
    let ignore = false;

    async function loadAttachments() {
      if (!latestCheckInId || !homework.required_checkpoint_type || !isCompleted) {
        if (!ignore) {
          setAttachments([]);
        }
        return;
      }

      const { data } = await getSupabase()
        .from("attachments")
        .select("*")
        .eq("check_in_id", latestCheckInId);

      if (!ignore) {
        setAttachments(data || []);
      }
    }

    void loadAttachments();

    return () => {
      ignore = true;
    };
  }, [homework.required_checkpoint_type, isCompleted, latestCheckInId]);

  const handleViewAttachments = async () => {
    const results = await Promise.all(
      attachments.map(async (attachment) => {
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
        (result): result is { type: "photo" | "audio"; url: string } => Boolean(result)
      )
    );
    setIsPreviewOpen(true);
  };

  const shouldShowStatusText =
    Boolean(statusText) && !(isCompleted && statusText === "已完成");

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
                <span className="rounded-full bg-forest-50 px-3 py-1">⏱️ {homework.estimated_minutes || 30}分钟</span>
                <span className="rounded-full bg-forest-50 px-3 py-1">⭐ {homework.point_value}积分</span>
              </div>
              {homework.daily_cutoff_time && (
                <p className="mt-2 text-xs text-forest-400">📍 截止 {homework.daily_cutoff_time}</p>
              )}
              {homework.required_checkpoint_type && attachments.length === 0 && (
                <p className="mt-1 text-xs text-forest-400">需要{proofLabel[homework.required_checkpoint_type]}</p>
              )}
              {attachments.length > 0 && (
                <button
                  type="button"
                  onClick={() => void handleViewAttachments()}
                  className="mt-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary shadow-sm transition hover:bg-primary/15"
                >
                  <span aria-hidden="true">📎</span>
                  查看已提交附件
                </button>
              )}
              {isRepeatSubmission && (
                <p className="mt-1 text-xs text-forest-400">再次提交不加分</p>
              )}
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
              <audio
                key={attachment.url}
                src={attachment.url}
                controls
                className="w-full"
              />
            )
          )}
        </div>
      </Modal>
    </>
  );
}
