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
    <div className="min-h-screen bg-background">
      <header className="bg-primary text-white p-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-xl font-bold">新建作业</h1>
          <p className="mt-1 text-sm text-white/80">
            可以一次分配给多个孩子，系统会分别创建独立作业。
          </p>
        </div>
      </header>
      <main className="max-w-6xl mx-auto p-4">
        <HomeworkForm copyFromHomeworkId={copyFromHomeworkId} prefilledChildId={childId} />
      </main>
    </div>
  );
}
