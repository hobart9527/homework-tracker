"use client";

type ChildOption = {
  id: string;
  name: string;
  avatar: string | null;
};

type HomeworkAssignmentPanelProps = {
  children: ChildOption[];
  selectedIds: string[];
  canBatchAssign: boolean;
  createCountLabel: string;
  independenceHint: string;
  onToggle: (childId: string) => void;
};

export function HomeworkAssignmentPanel({
  children,
  selectedIds,
  canBatchAssign,
  createCountLabel,
  independenceHint,
  onToggle,
}: HomeworkAssignmentPanelProps) {
  return (
    <section className="space-y-4 rounded-3xl border border-forest-200 bg-white/90 p-5">
      <div>
        <h2 className="text-lg font-semibold text-forest-700">分配给谁</h2>
        <p className="mt-1 text-sm text-forest-500">
          {canBatchAssign
            ? "可以一次选择多个孩子，系统会分别创建独立作业。"
            : "编辑时保持当前孩子不变，避免误改其他孩子的作业。"}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {children.map((child) => {
          const selected = selectedIds.includes(child.id);

          return (
            <button
              key={child.id}
              type="button"
              onClick={() => onToggle(child.id)}
              disabled={!canBatchAssign && !selected}
              className={`rounded-2xl border-2 px-4 py-3 text-left transition-all ${
                selected
                  ? "border-primary bg-primary/10"
                  : "border-forest-200 hover:border-forest-300"
              } ${!canBatchAssign && !selected ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <div className="font-medium text-forest-700">
                {child.avatar} {child.name}
              </div>
              <div className="mt-1 text-xs text-forest-500">
                {selected ? "已选中" : "点击加入这次分配"}
              </div>
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl bg-sand-50 px-4 py-3">
        <p className="text-sm font-medium text-forest-700">{createCountLabel}</p>
        <p className="mt-1 text-xs text-forest-500">{independenceHint}</p>
      </div>
    </section>
  );
}
