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
      <div className="rounded-radius-xl border border-dashed border-cream-200 bg-white/80 p-5 shadow-elevation-raised">
        <div className="text-sm font-medium text-forest-600">太棒了！</div>
        <div className="mt-3 text-lg font-bold text-forest-700">今天的任务全部完成啦！</div>
        <p className="mt-1 text-sm text-ink-500">可以休息一下，或者看看本周其他天的任务。</p>
      </div>
    );
  }

  return (
    <div className="rounded-radius-xl bg-gradient-to-r from-honey-100 via-cream-50 to-white p-5 shadow-elevation-floating ring-1 ring-honey-200">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-forest-600">下一项</div>
        <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-forest-600 shadow-elevation-raised">
          优先完成
        </span>
      </div>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="truncate text-lg font-bold text-forest-700">
            {task.typeIcon ?? "📝"} {task.title}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-sm text-ink-500">
            <span className="rounded-full bg-white/80 px-3 py-1 shadow-elevation-raised">
              截止 {task.dailyCutoffTime || "今天"}
            </span>
            <span className="rounded-full bg-white/80 px-3 py-1 shadow-elevation-raised">
              {task.pointValue} 积分
            </span>
            {task.estimatedMinutes ? (
              <span className="rounded-full bg-white/80 px-3 py-1 shadow-elevation-raised">
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
