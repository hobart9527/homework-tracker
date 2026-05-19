"use client";

import { useRouter } from "next/navigation";
import { HomeworkForm } from "@/components/parent/HomeworkForm";
import { Button } from "@/components/ui/Button";
import { useTranslation } from "@/hooks/useTranslation";

type NewHomeworkPageProps = {
  searchParams?: {
    childId?: string | string[];
    copyFrom?: string | string[];
  };
};

export default function NewHomeworkPage({
  searchParams,
}: NewHomeworkPageProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const copyFromParam = searchParams?.copyFrom;
  const copyFromHomeworkId =
    typeof copyFromParam === "string" ? copyFromParam : copyFromParam?.[0];

  const childIdParam = searchParams?.childId;
  const childId = typeof childIdParam === "string" ? childIdParam : childIdParam?.[0];

  return (
    <div className="max-w-7xl mx-auto space-y-space-6">
      <div className="flex items-center justify-between">
        <h1 className="text-ui-2xl font-ui-display font-bold text-forest-800">
          {t('parent.homework.newHomework')}
        </h1>
        <Button variant="ghost" size="sm" onClick={() => router.push('/homework')}>
          {t('common.back')}
        </Button>
      </div>
      <HomeworkForm copyFromHomeworkId={copyFromHomeworkId} prefilledChildId={childId} />
    </div>
  );
}
