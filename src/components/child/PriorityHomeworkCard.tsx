import type { DailyTaskStatus } from "@/lib/tasks/daily-task";
import { Button } from "@/components/ui/Button";

interface PriorityHomeworkCardProps {
  task: DailyTaskStatus | null;
  onOpen: () => void;
  actionLabel?: string;
}

export function PriorityHomeworkCard({
  task,
  onOpen,
  actionLabel,
}: PriorityHomeworkCardProps) {
  if (!task) {
    return (
      <div className="rounded-radius-xl border border-dashed border-cream-200 bg-cream-100/80 p-5 shadow-elevation-raised">
        <div className="text-sm font-medium text-forest-600">太棒了！</div>
        <div className="mt-3 text-lg font-bold text-forest-700">今天的任务全部完成啦！</div>
        <p className="mt-1 text-sm text-ink-500">可以休息一下，或者看看本周其他天的任务。</p>
      </div>
    );
  }

  return (
    <div className="rounded-radius-xl bg-gradient-to-r from-honey-100 via-cream-50 to-white p-5 shadow-elevation-floating ring-1 ring-honey-200">
      {/* 顶部标签行 */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="text-sm font-medium text-forest-600">下一项</div>
        <span className="rounded-full bg-forest-100/80 px-3 py-1 text-xs font-medium text-forest-600 shadow-elevation-raised">
          优先完成
        </span>
      </div>

      {/* 主内容：移动端垂直，桌面端水平 */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        {/* 左侧：图标 + 内容 */}
        <div className="flex min-w-0 flex-1 gap-3 sm:gap-4">
          {/* 图标 */}
          <span className="text-3xl sm:text-4xl leading-none shrink-0">{task.typeIcon ?? "📝"}</span>

          {/* 文字内容 */}
          <div className="min-w-0 flex-1">
            <h3 className="text-base sm:text-lg font-bold text-forest-700 truncate">
              {task.title}
            </h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs sm:text-sm text-ink-500">
              {task.dailyCutoffTime && (
                <span className="rounded-full bg-cream-100/80 px-2.5 py-0.5 shadow-elevation-raised shrink-0">
                  📍 截止 {task.dailyCutoffTime}
                </span>
              )}
              <span className="rounded-full bg-cream-100/80 px-2.5 py-0.5 shadow-elevation-raised shrink-0">
                ⭐ {task.pointValue} 积分
              </span>
              {task.estimatedMinutes ? (
                <span className="rounded-full bg-cream-100/80 px-2.5 py-0.5 shadow-elevation-raised shrink-0">
                  ⏱️ 约 {task.estimatedMinutes} 分钟
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* 右侧：按钮 */}
        <div className="shrink-0 w-full sm:w-auto">
          <Button
            size="md"
            onClick={onOpen}
            className="min-h-[44px] w-full sm:w-auto"
          >
            {actionLabel || (task.typeIcon === "📚" ? "去阅读" : "去完成")}
          </Button>
        </div>
      </div>
    </div>
  );
}
