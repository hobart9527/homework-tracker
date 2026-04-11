"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { HomeworkForm } from "@/components/parent/HomeworkForm";
import type { Database } from "@/lib/supabase/types";

type Homework = Database["public"]["Tables"]["homeworks"]["Row"];

export default function EditHomeworkPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const supabase = createClient();
  const [homework, setHomework] = useState<Homework | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHomework = async () => {
      const { data } = await supabase
        .from("homeworks")
        .select("*")
        .eq("id", params.id)
        .single();
      if (data) setHomework(data);
      setLoading(false);
    };
    fetchHomework();
  }, [supabase, params.id]);

  const handleDelete = async () => {
    if (!confirm("确定要删除这个作业吗？")) return;
    await supabase.from("homeworks").delete().eq("id", params.id);
    router.push("/homework");
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">加载中...</div>;
  if (!homework) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <h1 className="text-2xl font-bold text-forest-700">找不到该作业</h1>
        <Link href="/homework" className="mt-4 text-primary underline">返回作业列表</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary text-white p-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Link href="/homework"><span className="text-xl">←</span></Link>
          <h1 className="text-xl font-bold">编辑作业</h1>
          <button onClick={handleDelete} className="text-sm text-red-300 hover:text-red-100">
            删除
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4">
        <HomeworkForm homework={homework} onSuccess={() => router.push("/homework")} />
      </main>
    </div>
  );
}
