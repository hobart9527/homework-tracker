"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { HomeworkForm } from "@/components/parent/HomeworkForm";
import { Button } from "@/components/ui/Button";
import { useTranslation } from "@/hooks/useTranslation";
import type { Database } from "@/lib/supabase/types";

type Homework = Database["public"]["Tables"]["homeworks"]["Row"];

export default function EditHomeworkPage({ params }: { params: { id: string } }) {
  const { t } = useTranslation();
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
    if (!confirm(t('parent.homework.deleteConfirm'))) return;
    await supabase.from("homeworks").delete().eq("id", params.id);
    router.push("/homework");
  };

  if (loading) return <div className="py-12 text-center text-ui-lg">{t('parent.homework.loading')}</div>;
  if (!homework) {
    return (
      <div className="text-center py-12">
        <h1 className="text-ui-lg font-bold text-forest-700">{t('parent.homework.notFound')}</h1>
        <Button variant="ghost" size="sm" onClick={() => router.push('/homework')} className="mt-4">
          {t('parent.homework.backToList')}
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-space-6">
      <div className="flex items-center justify-between">
        <h1 className="text-ui-2xl font-ui-display font-bold text-forest-800">
          {t('parent.homework.editHomework')}
        </h1>
        <Button variant="ghost" size="sm" onClick={() => router.push('/homework')}>
          {t('common.back')}
        </Button>
      </div>
      <HomeworkForm homework={homework} onSuccess={() => router.push("/homework")} />
    </div>
  );
}