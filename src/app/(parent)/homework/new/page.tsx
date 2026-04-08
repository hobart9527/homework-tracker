import { HomeworkForm } from "@/components/parent/HomeworkForm";

export default function NewHomeworkPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary text-white p-4">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-xl font-bold">新建作业</h1>
        </div>
      </header>
      <main className="max-w-2xl mx-auto p-4">
        <HomeworkForm />
      </main>
    </div>
  );
}