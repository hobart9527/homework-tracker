"use client";

import type { HomeworkRulePreview as HomeworkRulePreviewModel } from "@/lib/homework-form";

type HomeworkRulePreviewProps = {
  preview: HomeworkRulePreviewModel;
};

export function HomeworkRulePreview({
  preview,
}: HomeworkRulePreviewProps) {
  return (
    <aside className="space-y-3 rounded-3xl border border-primary/20 bg-primary/5 p-5">
      <div>
        <h3 className="text-lg font-semibold text-forest-700">孩子端会这样显示</h3>
        <p className="mt-1 text-sm text-forest-500">{preview.title}</p>
      </div>

      <ul className="space-y-2 text-sm text-forest-600">
        <li>{preview.childLabel}</li>
        <li>{preview.scheduleLabel}</li>
        <li>{preview.proofLabel}</li>
        <li>{preview.cutoffLabel}</li>
        <li>{preview.scoringLabel}</li>
      </ul>
    </aside>
  );
}
