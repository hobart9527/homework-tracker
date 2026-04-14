"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { HomeworkCard } from "@/components/parent/HomeworkCard";
import { ReminderActionButton } from "@/components/parent/ReminderActionButton";
import { createClient } from "@/lib/supabase/client";
import { getLocalDayBounds } from "@/lib/homework-utils";
import type { Database } from "@/lib/supabase/types";
import type {
  ParentChildDashboardDetail,
  ParentReminderState,
} from "@/lib/parent-dashboard";

type Homework = Database["public"]["Tables"]["homeworks"]["Row"];
type Attachment = Database["public"]["Tables"]["attachments"]["Row"];
type Task = ParentChildDashboardDetail["tasks"][number] & {
  homeworkId?: string;
};

interface ParentChildTaskListProps {
  tasks: Task[];
  childId: string;
  selectedDate: string;
  reminderStates?: ParentReminderState[];
  onReminderStateChange?: (homeworkId: string, childId: string, targetDate: string) => void;
}

type PreviewAttachment = Attachment & {
  previewUrl: string;
};

function buildHomework(task: Task, index: number): Homework {
  return {
    id: task.homeworkId ?? `detail-task-${index}`,
    child_id: "",
    type_id: null,
    type_name: "今日任务",
    type_icon: task.typeIcon,
    title: task.title,
    description: null,
    repeat_type: "daily",
    repeat_days: null,
    repeat_interval: null,
    repeat_start_date: null,
    repeat_end_date: null,
    point_value: task.awardedPoints ?? 0,
    estimated_minutes: null,
    daily_cutoff_time: task.cutoffTime,
    is_active: true,
    required_checkpoint_type: task.proofType,
    created_by: "",
    created_at: "1970-01-01T00:00:00.000Z",
  };
}

function buildDayRange(date: string) {
  return getLocalDayBounds(new Date(`${date}T00:00:00`));
}

function isAttachmentVisible(task: Task) {
  return Boolean(task.proofType) && (task.statusText === "已完成" || task.statusText === "逾期完成");
}

export function ParentChildTaskList({
  tasks,
  childId,
  selectedDate,
  reminderStates,
  onReminderStateChange,
}: ParentChildTaskListProps) {
  const supabase = createClient();
  const [previewTaskTitle, setPreviewTaskTitle] = useState("");
  const [previewAttachments, setPreviewAttachments] = useState<PreviewAttachment[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const closePreview = () => {
    setPreviewOpen(false);
    setPreviewError(null);
    setPreviewLoading(false);
  };

  const handleAttachmentPreview = async (task: Task, taskHomeworkId: string) => {
    setPreviewTaskTitle(task.title);
    setPreviewAttachments([]);
    setPreviewError(null);
    setPreviewLoading(true);
    setPreviewOpen(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setPreviewError("请先重新登录后再查看附件");
        return;
      }

      const { start, end } = buildDayRange(selectedDate);
      const { data: checkInsData } = await supabase
        .from("check_ins")
        .select("id, homework_id, child_id, completed_at, proof_type")
        .eq("homework_id", taskHomeworkId)
        .eq("child_id", childId)
        .gte("completed_at", start)
        .lt("completed_at", end)
        .order("completed_at", { ascending: false })
        .limit(1);

      const checkIn = checkInsData?.[0];
      if (!checkIn) {
        setPreviewError("这条作业还没有找到可预览的打卡记录");
        return;
      }

      const { data: attachmentsData } = await supabase
        .from("attachments")
        .select("id, check_in_id, type, storage_path, created_at")
        .eq("check_in_id", checkIn.id);

      if (!attachmentsData || attachmentsData.length === 0) {
        setPreviewError("这条作业暂时没有可预览的附件");
        return;
      }

      const previewItems = await Promise.all(
        attachmentsData.map(async (attachment) => {
          const { data } = await supabase.storage
            .from("attachments")
            .createSignedUrl(attachment.storage_path, 60 * 30);

          return {
            ...attachment,
            previewUrl: data?.signedUrl ?? "",
          };
        })
      );

      setPreviewAttachments(previewItems);
    } catch {
      setPreviewError("附件加载失败，请稍后再试");
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-lg font-semibold text-forest-800">任务清单</h3>
        <p className="text-sm text-forest-500">点击日历切换日期后，这里会同步更新当天的作业情况</p>
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-forest-200 bg-white py-10 text-center text-forest-400">
          <span className="text-4xl">🎉</span>
          <p className="mt-2">今天没有任务</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task, index) => {
            const taskHomeworkId = task.homeworkId ?? `detail-task-${index}`;
            const canPreviewAttachment = isAttachmentVisible(task);

            return (
              <div key={taskHomeworkId}>
                <HomeworkCard
                  homework={buildHomework(task, index)}
                  checkIn={null}
                  statusText={task.statusText}
                  proofType={task.proofType}
                  awardedPoints={task.awardedPoints}
                  scored={task.scored}
                />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-forest-50/70 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {canPreviewAttachment ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleAttachmentPreview(task, taskHomeworkId)}
                      >
                        查看附件
                      </Button>
                    ) : (
                      <span className="text-xs text-forest-400">完成后可查看附件</span>
                    )}
                  </div>
                  <div className="ml-auto">
                    <ReminderActionButton
                      homeworkId={taskHomeworkId}
                      childId={childId}
                      targetDate={selectedDate}
                      state={
                        reminderStates?.find(
                          (s) =>
                            s.homeworkId === taskHomeworkId &&
                            s.targetDate === selectedDate
                        ) ?? null
                      }
                      onRemind={(hwId, nextChildId, targetDate) => {
                        onReminderStateChange?.(hwId, nextChildId, targetDate);
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal isOpen={previewOpen} onClose={closePreview} title="附件预览" size="xl">
        <div className="space-y-4">
          <div>
            <p className="text-sm text-forest-500">{previewTaskTitle}</p>
            <p className="mt-1 text-xs text-forest-400">
              图片可直接查看，音频可在下方播放器里试听
            </p>
          </div>

          {previewLoading ? (
            <div className="rounded-2xl border border-dashed border-forest-200 bg-forest-50 py-10 text-center text-forest-400">
              正在加载附件...
            </div>
          ) : previewError ? (
            <div className="rounded-2xl border border-dashed border-forest-200 bg-forest-50 py-8 text-center text-forest-500">
              {previewError}
            </div>
          ) : previewAttachments.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-forest-200 bg-forest-50 py-8 text-center text-forest-400">
              暂时没有可预览的附件
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {previewAttachments.map((attachment, index) => (
                <div
                  key={attachment.id}
                  className="space-y-3 rounded-2xl border border-forest-100 bg-forest-50/60 p-3"
                >
                  <div className="flex items-center justify-between text-sm text-forest-500">
                    <span>{attachment.type === "photo" ? "照片" : "音频"}</span>
                    <span>附件 {index + 1}</span>
                  </div>

                  {attachment.type === "photo" ? (
                    <img
                      src={attachment.previewUrl}
                      alt={`${previewTaskTitle} 附件 ${index + 1}`}
                      className="h-64 w-full rounded-2xl object-cover"
                    />
                  ) : (
                    <audio
                      controls
                      src={attachment.previewUrl}
                      className="w-full"
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </section>
  );
}
