import type { DailyTaskStatus } from "@/lib/tasks/daily-task";
import { Button } from "@/components/ui/Button";

interface PriorityHomeworkCardProps {
  task: DailyTaskStatus | null;
  onOpen: () => void;
}

export function PriorityHomeworkCard({
  task,
  onOpen,
}: PriorityHomeworkCardProps) {
  if (!task) {
    return (
      <div className="rounded-[28px] border border-dashed border-forest-200 bg-white/80 p-5 shadow-sm">
        <div className="text-sm font-medium text-forest-600">太棒了！</div>
        <div className="mt-3 text-lg font-bold text-forest-700">今天的任务全部完成啦！</div>
        <p className="mt-1 text-sm text-forest-500">可以休息一下，或者看看本周其他天的任务。</p>
      </div>
    );
  }

  return (
    <div className="rounded-[28px] bg-gradient-to-r from-amber-100 via-orange-50 to-white p-5 shadow-md ring-1 ring-amber-200">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-forest-600">下一项</div>
        <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-forest-600 shadow-sm">
          优先完成
        </span>
      </div>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="truncate text-lg font-bold text-forest-700">
            {task.typeIcon ?? "📝"} {task.title}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-sm text-forest-500">
            <span className="rounded-full bg-white/80 px-3 py-1 shadow-sm">
              截止 {task.dailyCutoffTime || "今天"}
            </span>
            <span className="rounded-full bg-white/80 px-3 py-1 shadow-sm">
              {task.pointValue} 积分
            </span>
            {task.estimatedMinutes ? (
              <span className="rounded-full bg-white/80 px-3 py-1 shadow-sm">
                约 {task.estimatedMinutes} 分钟
              </span>
            ) : null}
          </div>
        </div>
        <Button size="lg" onClick={onOpen}>
          去完成
        </Button>
      </div>
    </div>
  );
}
