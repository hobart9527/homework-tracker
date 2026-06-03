import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
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

  // --- Batch load all data before looping ---

  const parentIds = parents.map((p) => p.id);

  // 1. Load all children for all parents in one query
  const { data: allChildren } = await supabase
    .from("children")
    .select("id, name, parent_id")
    .in("parent_id", parentIds);

  const childrenByParentId = new Map<string, typeof allChildren>();
  const allChildIds: string[] = [];

  if (allChildren) {
    for (const child of allChildren) {
      const group = childrenByParentId.get(child.parent_id);
      if (group) {
        group.push(child);
      } else {
        childrenByParentId.set(child.parent_id, [child]);
      }
      allChildIds.push(child.id);
    }
  }

  if (allChildIds.length === 0) {
    return NextResponse.json({ message: "No children found for parents with auto remind enabled" });
  }

  // 2. Load all active homeworks for all children in one query
  const { data: allHomeworks } = await supabase
    .from("homeworks")
    .select("id, child_id, title, repeat_type, repeat_days, repeat_start_date, repeat_end_date, repeat_interval, is_active")
    .in("child_id", allChildIds)
    .eq("is_active", true);

  const homeworksByChildId = new Map<string, NonNullable<typeof allHomeworks>>();
  if (allHomeworks) {
    for (const hw of allHomeworks) {
      const group = homeworksByChildId.get(hw.child_id);
      if (group) {
        group.push(hw);
      } else {
        homeworksByChildId.set(hw.child_id, [hw]);
      }
    }
  }

  // 3. Load all today's check_ins for all children in one query
  const startOfDay = `${todayKey}T00:00:00`;
  const endOfDay = `${todayKey}T23:59:59`;

  const { data: allCheckIns } = await supabase
    .from("check_ins")
    .select("homework_id, child_id")
    .in("child_id", allChildIds)
    .gte("completed_at", startOfDay)
    .lte("completed_at", endOfDay);

  // Build set of completed homework IDs for today
  const completedHomeworkIds = new Set(
    allCheckIns?.map((ci) => `${ci.homework_id}:${ci.child_id}`) || []
  );

  // 4. Load all today's reminders for all children in one query
  const { data: allTodayReminders } = await supabase
    .from("homework_reminders")
    .select("homework_id, child_id, target_date")
    .in("child_id", allChildIds)
    .eq("target_date", todayKey);

  const existingReminderKeys = new Set(
    allTodayReminders?.map((r) => `${r.homework_id}:${r.child_id}`) || []
  );

  // --- Loop with in-memory lookups only (zero per-parent DB queries) ---

  const results: any[] = [];
  const remindersToInsert: Array<{
    parent_id: string;
    child_id: string;
    homework_id: string;
    target_date: string;
    status: string;
    initial_sent_at: string;
  }> = [];

  for (const parent of parents) {
    const children = childrenByParentId.get(parent.id);
    if (!children || children.length === 0) continue;

    // Collect all homeworks across this parent's children from in-memory map
    const parentHomeworks: NonNullable<typeof allHomeworks> = [];
    for (const child of children) {
      const childHomeworks = homeworksByChildId.get(child.id);
      if (childHomeworks) {
        parentHomeworks.push(...childHomeworks);
      }
    }

    if (parentHomeworks.length === 0) continue;

    for (const homework of parentHomeworks) {
      // Check if homework is scheduled for today
      if (!isHomeworkScheduledForDate(homework, today)) continue;

      const taskKey = `${homework.id}:${homework.child_id}`;

      // Skip if already completed today (in-memory check)
      if (completedHomeworkIds.has(taskKey)) continue;

      // Check if reminder already sent today (in-memory check)
      if (existingReminderKeys.has(taskKey)) continue;

      const child = children.find((c) => c.id === homework.child_id);

      remindersToInsert.push({
        parent_id: parent.id,
        child_id: homework.child_id,
        homework_id: homework.id,
        target_date: todayKey,
        status: "sent_sms",
        initial_sent_at: now.toISOString(),
      });

      results.push({
        homeworkId: homework.id,
        childId: homework.child_id,
        childName: child?.name,
        homeworkTitle: homework.title,
      });
    }
  }

  // Batch insert all reminders at once
  let insertedReminders: any[] = [];
  if (remindersToInsert.length > 0) {
    const { data: inserted, error: batchError } = await supabase
      .from("homework_reminders")
      .insert(remindersToInsert)
      .select("*");
    if (batchError) {
      results.push({ error: batchError.message, batchFailed: true });
    } else {
      insertedReminders = inserted || [];
    }
  }

  // Annotate results with actual status from batch insert
  const insertedKeys = new Set(insertedReminders.map((r) => `${r.homework_id}:${r.child_id}`));
  for (const r of results) {
    if (r.error) continue;
    r.status = insertedKeys.has(`${r.homeworkId}:${r.childId}`) ? "reminder_sent" : "insert_missing";
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
      if (dateKey < homework.repeat_start_date) return false;
      if (homework.repeat_end_date && dateKey > homework.repeat_end_date) return false;
      const startDate = new Date(homework.repeat_start_date);
      const diffTime = date.getTime() - startDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      return diffDays % (homework.repeat_interval || 1) === 0;

    case "once":
      return homework.repeat_start_date === dateKey;

    default:
      return false;
  }
}
