"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { buildHomeworkListView } from "@/lib/homework-list";
import { buildNewHomeworkHref } from "@/lib/homework-form";
import { useTranslation } from "@/hooks/useTranslation";
import type { Database } from "@/lib/supabase/types";

type Homework = Database["public"]["Tables"]["homeworks"]["Row"];
type Child = Database["public"]["Tables"]["children"]["Row"];

export default function HomeworkListPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [homeworks, setHomeworks] = useState<Homework[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const [{ data: childrenData }, { data: homeworksData }] =
        await Promise.all([
          supabase.from("children").select("*").eq("parent_id", session.user.id),
          supabase
            .from("homeworks")
            .select("id, child_id, type_name, type_icon, title, repeat_type, repeat_days, repeat_interval, repeat_start_date, repeat_end_date, point_value, daily_cutoff_time, is_active, created_at, required_checkpoint_type, estimated_minutes")
            .eq("created_by", session.user.id)
            .order("created_at", { ascending: false }),
        ]);

      if (childrenData) setChildren(childrenData);
      if (homeworksData) setHomeworks(homeworksData as Homework[]);
      setLoading(false);
    };

    fetchData();
  }, [supabase]);

  const getChildName = (childId: string) =>
    children.find((c) => c.id === childId)?.name || t('parent.homework.unknownChild');

  const listView = buildHomeworkListView(children, homeworks, {
    selectedChildId,
    date: new Date(),
  });

  const handleDelete = async (id: string) => {
    if (!confirm(t('parent.homework.deleteConfirm'))) return;
    await supabase.from("homeworks").delete().eq("id", id);
    setHomeworks((prev) => prev.filter((h) => h.id !== id));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-ui-lg">{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-space-6">
      <div className="flex items-center justify-between">
        <h1 className="text-ui-2xl font-ui-display font-bold text-forest-800">{t('parent.homework.title')}</h1>
        <Button size="sm" onClick={() => router.push('/homework/new')}>
          {t('parent.homework.newHomework')}
        </Button>
      </div>

      {homeworks.length === 0 ? (
          <div className="text-center py-12">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-16 h-16 mx-auto text-ink-300">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            <h2 className="text-ui-xl font-ui-display font-bold text-forest-700 mt-space-4">
              {t('parent.homework.noHomework')}
            </h2>
            <p className="text-ink-500 mt-space-2">{t('parent.homework.createFirst')}</p>
          </div>
        ) : (
          <div className="grid gap-space-6 lg:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="rounded-radius-xl border border-ink-300 bg-white p-space-4">
              <h2 className="text-ui-sm font-ui-display font-semibold text-forest-700">{t('parent.childSelector.selectChild')}</h2>
              <div className="mt-space-3 space-y-space-2">
                <button
                  type="button"
                  onClick={() => setSelectedChildId("all")}
                  className={`w-full rounded-radius-xl px-4 py-3 text-left transition-all ${
                    selectedChildId === "all"
                      ? "bg-forest-500/10 text-ink-600"
                      : "bg-ink-50 text-ink-600 hover:bg-ink-100"
                  }`}
                >
                  {t('parent.monthCalendar.allChildren')}
                </button>
                {children.map((child) => (
                  <button
                    key={child.id}
                    type="button"
                    onClick={() => setSelectedChildId(child.id)}
                    className={`w-full rounded-radius-xl px-4 py-3 text-left transition-all ${
                      selectedChildId === child.id
                        ? "bg-forest-500/10 text-ink-600"
                        : "bg-ink-50 text-ink-600 hover:bg-ink-100"
                    }`}
                  >
                    {child.avatar} {child.name}
                  </button>
                ))}
              </div>
            </aside>

            <div className="space-y-space-6">
              {listView.sections.map((section) => (
                <section key={section.title} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-ui-lg font-ui-display font-semibold text-forest-700">
                      {section.title}
                    </h2>
                    <span className="text-ui-sm text-ink-400">
                      {section.items.length} {t('parent.homework.items')}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {section.items.map((hw) => (
                      <Card key={hw.id}>
                        <div className="flex items-start gap-3">
                          <span className="text-ui-3xl">{hw.type_icon}</span>
                          <div className="flex-1">
                            <div className="flex items-center gap-space-2">
                              <h3 className="font-semibold text-forest-700">
                                {hw.title}
                              </h3>
                              <span className="text-ui-xs text-ink-400">
                                {getChildName(hw.child_id)}
                              </span>
                              <span
                                className={`rounded-radius-sm px-2 py-0.5 text-ui-xs ${
                                  hw.isDueToday
                                    ? "bg-forest-500/10 text-ink-600"
                                    : "bg-forest-100 text-ink-500"
                                }`}
                              >
                                {hw.isDueToday ? t('parent.homework.todayTask') : t('parent.homework.otherTask')}
                              </span>
                            </div>
                            <p className="mt-space-1 text-ui-sm text-ink-500">
                              {hw.type_name} • {hw.point_value}{t('parent.homework.points')}
                            </p>
                            <p className="mt-space-1 text-ui-xs text-ink-400">
                              {{
                                daily: t('parent.homework.daily'),
                                weekly: t('parent.homework.weekly') + (hw.repeat_days || []).map((d) => "日一二三四五六"[d]).join(""),
                                interval: t('parent.homework.interval') + `${hw.repeat_interval}`,
                                once: t('parent.homework.once'),
                              }[hw.repeat_type]}
                              {hw.daily_cutoff_time ? ` • 截止 ${hw.daily_cutoff_time}` : ""}
                              {hw.required_checkpoint_type
                                ? ` • 需要${hw.required_checkpoint_type === "photo" ? t('parent.homework.photo') : t('parent.homework.audio')}`
                                : ""}
                            </p>
                          </div>
                          <div className="flex gap-space-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => router.push(`/homework/new?copyFrom=${hw.id}`)}
                            >
                              {t('parent.homework.copy')}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => router.push(`/homework/${hw.id}`)}
                            >
                              {t('common.edit')}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDelete(hw.id)}
                              className="text-coral-600"
                            >
                              {t('common.delete')}
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        )}
    </div>
  );
}
