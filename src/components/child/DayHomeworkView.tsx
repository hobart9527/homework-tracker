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
    <div className="rounded-[28px] bg-white p-5 shadow-md ring-1 ring-forest-100">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-forest-700">任务清单</h2>
          <p className="mt-1 text-sm text-forest-500">把今天的任务一项项清掉。</p>
        </div>
        <span className="text-sm text-forest-500">
          {taskStatuses.filter((task) => task.completed).length}/{taskStatuses.length}
        </span>
      </div>
      <div className="space-y-3">
        {taskStatuses.length === 0 ? (
          <div className="text-center py-12">
            <span className="text-6xl">🎉</span>
            <h2 className="text-xl font-bold text-forest-700 mt-4">
              今天没有作业！
            </h2>
            <p className="text-forest-500 mt-2">好好休息吧～</p>
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
