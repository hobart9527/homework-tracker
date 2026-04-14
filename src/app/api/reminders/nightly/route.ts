import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const CRON_SECRET = process.env.CRON_SECRET || "";

/**
 * Nightly reminder cron job - runs before cutoff time to remind about incomplete homework
 *
 * Headers:
 * - x-cron-secret: Secret token for authentication (required for non-browser calls)
 *
 * Query params:
 * - cutoffHour: Hour of cutoff time (default 23)
 * - cutoffMinute: Minute of cutoff time (default 30)
 *
 * This endpoint should be called by a cron job ~30 minutes before cutoff time
 */
export async function GET(request: Request) {
  // Allow cron jobs with secret token OR authenticated sessions
  const cronSecret = request.headers.get("x-cron-secret");
  const isCronCall = cronSecret && cronSecret === CRON_SECRET;

  const supabase = isCronCall
    ? await createServiceRoleClient()
    : await createClient();

  if (!isCronCall) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const { searchParams } = new URL(request.url);
  const cutoffHour = parseInt(searchParams.get("cutoffHour") || "23", 10);
  const cutoffMinute = parseInt(searchParams.get("cutoffMinute") || "30", 10);

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  // Get cutoff time for today
  const cutoffTime = `${String(cutoffHour).padStart(2, "0")}:${String(cutoffMinute).padStart(2, "0")}`;
  const cutoffDateTime = new Date(`${todayKey}T${cutoffTime}:00`);
  const now = new Date();

  // Only proceed if we're within 60 minutes of cutoff time
  const minutesToCutoff = (cutoffDateTime.getTime() - now.getTime()) / (1000 * 60);
  if (minutesToCutoff > 60 || minutesToCutoff < 0) {
    return NextResponse.json({
      message: "Not within reminder window",
      minutesToCutoff,
      cutoffTime,
    });
  }

  // Get all parents with auto_remind_parent enabled
  const { data: parents } = await supabase
    .from("parents")
    .select("id, reminder_cutoff_time")
    .eq("auto_remind_parent", true);

  if (!parents || parents.length === 0) {
    return NextResponse.json({ message: "No parents with auto remind enabled" });
  }

  const results = [];

  for (const parent of parents) {
    // Get children for this parent
    const { data: children } = await supabase
      .from("children")
      .select("id, name, parent_id")
      .eq("parent_id", parent.id);

    if (!children || children.length === 0) continue;

    const childIds = children.map((c) => c.id);

    // Get all active homeworks for these children scheduled for today
    const { data: homeworks } = await supabase
      .from("homeworks")
      .select("*")
      .in("child_id", childIds)
      .eq("is_active", true);

    if (!homeworks || homeworks.length === 0) continue;

    // Get check-ins for today to find incomplete homeworks
    const startOfDay = `${todayKey}T00:00:00`;
    const endOfDay = `${todayKey}T23:59:59`;

    const { data: checkIns } = await supabase
      .from("check_ins")
      .select("homework_id, child_id")
      .in("child_id", childIds)
      .gte("completed_at", startOfDay)
      .lte("completed_at", endOfDay);

    // Build set of completed homework IDs for today
    const completedHomeworkIds = new Set(
      checkIns?.map((ci) => `${ci.homework_id}:${ci.child_id}`) || []
    );

    for (const homework of homeworks) {
      // Check if homework is scheduled for today
      if (!isHomeworkScheduledForDate(homework, today)) continue;

      const taskKey = `${homework.id}:${homework.child_id}`;

      // Skip if already completed today
      if (completedHomeworkIds.has(taskKey)) continue;

      // Check if reminder already sent today
      const { data: existingReminder } = await supabase
        .from("homework_reminders")
        .select("*")
        .eq("homework_id", homework.id)
        .eq("target_date", todayKey)
        .eq("child_id", homework.child_id)
        .single();

      if (existingReminder) continue; // Already reminded

      const child = children.find((c) => c.id === homework.child_id);

      // Create reminder record
      const { data: reminder, error } = await supabase
        .from("homework_reminders")
        .insert({
          parent_id: parent.id,
          child_id: homework.child_id,
          homework_id: homework.id,
          target_date: todayKey,
          status: "sent_sms",
          initial_sent_at: now.toISOString(),
        })
        .select("*")
        .single();

      if (error) {
        results.push({
          homeworkId: homework.id,
          childId: homework.child_id,
          childName: child?.name,
          homeworkTitle: homework.title,
          error: error.message,
        });
      } else {
        results.push({
          homeworkId: homework.id,
          childId: homework.child_id,
          childName: child?.name,
          homeworkTitle: homework.title,
          status: "reminder_sent",
        });
      }
    }
  }

  return NextResponse.json({
    date: todayKey,
    cutoffTime,
    totalReminders: results.length,
    results,
  });
}

function isHomeworkScheduledForDate(
  homework: { repeat_type: string; repeat_days: number[] | null; repeat_start_date: string | null; repeat_end_date: string | null; repeat_interval: number | null },
  date: Date
): boolean {
  const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const dayOfWeek = date.getDay();

  switch (homework.repeat_type) {
    case "daily":
      if (homework.repeat_start_date && homework.repeat_start_date > dateKey) return false;
      if (homework.repeat_end_date && homework.repeat_end_date < dateKey) return false;
      return true;

    case "weekly":
      return homework.repeat_days?.includes(dayOfWeek) ?? false;

    case "interval":
      if (!homework.repeat_start_date) return false;
      const startDate = new Date(homework.repeat_start_date);
      const diffTime = Math.abs(date.getTime() - startDate.getTime());
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      return diffDays % (homework.repeat_interval || 1) === 0;

    case "once":
      return homework.repeat_start_date === dateKey;

    default:
      return false;
  }
}
