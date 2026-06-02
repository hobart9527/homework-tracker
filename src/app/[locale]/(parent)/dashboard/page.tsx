import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDateKey } from "@/lib/homework-utils";
import { buildParentDashboard } from "@/lib/parent-dashboard";
import type { Database } from "@/lib/supabase/types";
import ParentDashboardClient from "./ParentDashboardClient";

type Child = Database["public"]["Tables"]["children"]["Row"];
type Homework = Database["public"]["Tables"]["homeworks"]["Row"];
type CheckIn = Database["public"]["Tables"]["check_ins"]["Row"];

interface ParentDashboardPageProps {
  params: { locale: string };
}

export default async function ParentDashboardPage({
  params,
}: ParentDashboardPageProps) {
  const { locale } = params;
  const supabase = await createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect(`/${locale}/login`);
  }

  const { data: childrenData } = await supabase
    .from("children")
    .select("id, name, avatar")
    .eq("parent_id", session.user.id);

  const children = (childrenData ?? []) as Child[];

  let initialHomeworks: Homework[] = [];
  let initialCheckIns: CheckIn[] = [];

  if (children.length > 0) {
    const childIds = children.map((child) => child.id);
    const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const results = await Promise.all([
      supabase
        .from("homeworks")
        .select("id, child_id, type_name, type_icon, title, repeat_type, repeat_days, repeat_interval, repeat_start_date, repeat_end_date, point_value, daily_cutoff_time, is_active, required_checkpoint_type")
        .eq("created_by", session.user.id),
      supabase
        .from("check_ins")
        .select("id, homework_id, child_id, completed_at, is_scored, is_late, awarded_points, points_earned, proof_type")
        .in("child_id", childIds)
        .gte("completed_at", threeMonthsAgo),
    ]);

    initialHomeworks = (results[0].data ?? []) as Homework[];
    initialCheckIns = (results[1].data ?? []) as CheckIn[];
  }

  const today = formatDateKey(new Date());
  const thisMonth = today.slice(0, 7);

  const initialDashboard = buildParentDashboard({
    children,
    homeworks: initialHomeworks,
    checkIns: initialCheckIns,
    date: today,
    month: thisMonth,
  });

  return (
    <ParentDashboardClient
      initialDashboard={initialDashboard}
      initialChildren={children}
      initialHomeworks={initialHomeworks}
      initialCheckIns={initialCheckIns}
      initialDate={today}
      initialMonth={thisMonth}
      locale={locale}
    />
  );
}
