import { HomeworkForm } from "@/components/parent/HomeworkForm";

type NewHomeworkPageProps = {
  searchParams?: {
    childId?: string | string[];
    copyFrom?: string | string[];
  };
};

export default function NewHomeworkPage({
  searchParams,
}: NewHomeworkPageProps) {
  const copyFromParam = searchParams?.copyFrom;
  const copyFromHomeworkId =
    typeof copyFromParam === "string" ? copyFromParam : copyFromParam?.[0];

  const childIdParam = searchParams?.childId;
  const childId = typeof childIdParam === "string" ? childIdParam : childIdParam?.[0];

  return (
    <div className="space-y-space-6">
      <p className="text-ui-sm text-ink-500">
        可以一次分配给多个孩子，系统会分别创建独立作业。
      </p>
      <HomeworkForm copyFromHomeworkId={copyFromHomeworkId} prefilledChildId={childId} />
    </div>
  );
}
