import { buildReminderStateFromRow } from "@/lib/reminders";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const ESCALATE_AFTER_MS = 2 * 60 * 60 * 1000; // 2 hours

export async function GET(request: Request) {
  const supabase = await createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parentId = searchParams.get("parentId");
  const month = searchParams.get("month"); // e.g. "2026-04"

  if (!parentId || !month) {
    return NextResponse.json({ error: "Missing parentId or month" }, { status: 400 });
  }

  const startDate = `${month}-01`;
  const [year, mon] = month.split("-").map(Number);
  const lastDay = new Date(year, mon, 0).getDate();
  const endDate = `${month}-${String(lastDay).padStart(2, "0")}`;

  const { data: rows, error } = await supabase
    .from("homework_reminders")
    .select("*")
    .eq("parent_id", parentId)
    .gte("target_date", startDate)
    .lte("target_date", endDate);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const reminderStates = (rows ?? []).map((row) =>
    buildReminderStateFromRow({
      ...row,
      escalate_after: row.initial_sent_at
        ? new Date(new Date(row.initial_sent_at).getTime() + ESCALATE_AFTER_MS).toISOString()
        : null,
    })
  );

  return NextResponse.json({ reminderStates });
}

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { child_id, homework_id, target_date } = await request.json();

  if (!child_id || !homework_id || !target_date) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const now = new Date().toISOString();

  const { data: reminder, error } = await supabase
    .from("homework_reminders")
    .upsert(
      {
        parent_id: session.user.id,
        child_id,
        homework_id,
        target_date,
        status: "sent_sms",
        initial_sent_at: now,
      },
      { onConflict: "homework_id,target_date" }
    )
    .select("*")
    .single();

  if (error || !reminder) {
    return NextResponse.json({ error: error?.message ?? "Failed to upsert reminder" }, { status: 500 });
  }

  const escalate_after = new Date(new Date(now).getTime() + ESCALATE_AFTER_MS).toISOString();

  return NextResponse.json({ reminder: { ...reminder, escalate_after } });
}
