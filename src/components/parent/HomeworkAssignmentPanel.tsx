"use client";

import { useTranslation } from "@/hooks/useTranslation";

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
  const { t } = useTranslation();

  return (
    <section className="space-y-4 rounded-3xl border border-forest-200 bg-white/90 p-5">
      <div>
        <h2 className="text-lg font-semibold text-forest-700">{t('parent.homework.assignedTo')}</h2>
        <p className="mt-1 text-sm text-forest-500">
          {canBatchAssign
            ? t('parent.homework.batchHint')
            : t('parent.homework.editHint')}
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
                {selected ? t('parent.homework.selected') : t('parent.homework.clickToAdd')}
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
