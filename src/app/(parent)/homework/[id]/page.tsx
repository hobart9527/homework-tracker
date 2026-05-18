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

  if (loading) return <div className="py-12 text-center text-ui-lg">加载中...</div>;
  if (!homework) {
    return (
      <div className="text-center py-12">
        <h1 className="text-ui-lg font-bold text-forest-700">找不到该作业</h1>
        <Link href="/homework" className="mt-4 block text-forest-600 underline">返回作业列表</Link>
      </div>
    );
  }

  return (
    <div className="space-y-space-6">
      <HomeworkForm homework={homework} onSuccess={() => router.push("/homework")} />
    </div>
  );
}