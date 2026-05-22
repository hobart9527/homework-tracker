import { isAfterCutoff } from "@/lib/homework-utils";
import { ChildHomeworkCard } from "@/components/child/ChildHomeworkCard";
import { buildDailyTaskStatuses } from "@/lib/tasks/daily-task";
import type { Database } from "@/lib/supabase/types";
import type { AttachmentUploadStatus } from "@/lib/attachment-types";

type Homework = Database["public"]["Tables"]["homeworks"]["Row"];
type CheckIn = Database["public"]["Tables"]["check_ins"]["Row"];

interface DayHomeworkViewProps {
  date: string;
  homeworks: Homework[];
  checkIns: CheckIn[];
  onSelectHomework: (homework: Homework) => void;
  attachmentUploadStatuses?: Record<string, AttachmentUploadStatus>;
}

export function DayHomeworkView({
  date,
  homeworks,
  checkIns,
  onSelectHomework,
  attachmentUploadStatuses = {},
}: DayHomeworkViewProps) {
  const taskStatuses = buildDailyTaskStatuses(homeworks, checkIns, date);

  return (
    <div className="rounded-radius-xl bg-white p-5 shadow-elevation-floating ring-1 ring-cream-200">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-forest-700">任务清单</h2>
          <p className="mt-1 text-sm text-ink-500">把今天的任务一项项清掉。</p>
        </div>
        <span className="text-sm text-ink-500">
          {taskStatuses.filter((task) => task.completed).length}/{taskStatuses.length}
        </span>
      </div>
      <div className="space-y-3">
        {taskStatuses.length === 0 ? (
          <div className="text-center py-12">
            <div className="mx-auto mb-4 flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-honey-50 to-honey-100 shadow-elevation-floating ring-1 ring-honey-200/50">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-14 h-14 text-honey-400">
                <path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-forest-700">
              今天没有作业！
            </h2>
            <p className="mt-2 text-ink-500">好好休息吧～</p>
            <div className="mx-auto mt-5 h-16 w-16 rounded-full border-2 border-dashed border-cream-200/60" aria-hidden="true" />
          </div>
        ) : (
          taskStatuses.map((task) => {
            const homework = homeworks.find((item) => item.id === task.homeworkId);
            if (!homework) {
              return null;
            }

            return (
              <ChildHomeworkCard
                key={task.homeworkId}
                homework={homework}
                isCompleted={task.completed}
                isOverdue={!task.completed && isAfterCutoff(homework.daily_cutoff_time, new Date())}
                isRepeatSubmission={task.submissionCount > 1}
                latestCheckInId={task.latestCheckInId}
                latestProofType={task.latestProofType}
                attachmentUploadStatus={attachmentUploadStatuses[homework.id]}
                statusText={
                  task.completed
                    ? task.late
                      ? "已逾期完成"
                      : task.submissionCount > 1
                        ? "再次提交不加分"
                        : "已完成"
                    : isAfterCutoff(homework.daily_cutoff_time, new Date())
                      ? "逾期可补交"
                      : "待完成"
                }
                onComplete={() => onSelectHomework(homework)}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
