"use client";

import { useTranslation } from "@/hooks/useTranslation";
import type { HomeworkRulePreview as HomeworkRulePreviewModel } from "@/lib/homework-form";

type HomeworkRulePreviewProps = {
  preview: HomeworkRulePreviewModel;
};

export function HomeworkRulePreview({
  preview,
}: HomeworkRulePreviewProps) {
  const { t } = useTranslation();

  return (
    <aside className="space-y-3 rounded-radius-xl border border-primary/20 bg-primary/5 p-4">
      <div>
        <h3 className="text-lg font-semibold text-forest-700">{t('parent.homework.previewTitle')}</h3>
        <p className="mt-1 text-sm text-forest-500">{preview.title}</p>
      </div>

      <ul className="space-y-2 text-sm text-forest-600">
        <li>{preview.childLabel}</li>
        <li>{preview.scheduleLabel}</li>
        <li>{preview.proofLabel}</li>
        <li>{preview.cutoffLabel}</li>
        <li>{preview.scoringLabel}</li>
        <li>{preview.recordingLabel}</li>
        <li>{preview.wechatPushLabel}</li>
      </ul>
    </aside>
  );
}
