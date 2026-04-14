"use client";

import { HomeworkCard } from "@/components/parent/HomeworkCard";
import { ReminderActionButton } from "@/components/parent/ReminderActionButton";
import type { Database } from "@/lib/supabase/types";
import type { ParentChildDashboardDetail, ParentReminderState } from "@/lib/parent-dashboard";

type Homework = Database["public"]["Tables"]["homeworks"]["Row"];
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

export function ParentChildTaskList({
  tasks,
  childId,
  selectedDate,
  reminderStates,
  onReminderStateChange,
}: ParentChildTaskListProps) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-lg font-semibold text-forest-800">今日任务</h3>
        <p className="text-sm text-forest-500">按状态展示每一项作业的详细信息</p>
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-forest-200 bg-white py-10 text-center text-forest-400">
          <span className="text-4xl">🎉</span>
          <p className="mt-2">今天没有任务</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task, index) => (
            <div key={task.homeworkId ?? `${task.title}-${index}`}>
              <HomeworkCard
                homework={buildHomework(task, index)}
                checkIn={null}
                statusText={task.statusText}
                proofType={task.proofType}
                awardedPoints={task.awardedPoints}
                scored={task.scored}
              />
              <div className="flex items-center justify-end mt-2">
                <ReminderActionButton
                  homeworkId={task.homeworkId ?? ""}
                  childId={childId}
                  targetDate={selectedDate}
                  state={reminderStates?.find((s) => s.homeworkId === task.homeworkId) ?? null}
                  onRemind={(hwId, childId, targetDate) => {
                  onReminderStateChange?.(hwId, childId, targetDate);
                }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
