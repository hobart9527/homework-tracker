import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { homework_id, target_date } = await request.json();

  if (!homework_id || !target_date) {
    return NextResponse.json({ error: "Missing homework_id or target_date" }, { status: 400 });
  }

  const now = new Date().toISOString();

  const { data: reminder, error } = await supabase
    .from("homework_reminders")
    .update({
      status: "escalated_call",
      escalated_at: now,
    })
    .eq("homework_id", homework_id)
    .eq("target_date", target_date)
    .eq("parent_id", session.user.id)
    .select("*")
    .single();

  if (error || !reminder) {
    return NextResponse.json({ error: error?.message ?? "Reminder not found" }, { status: 404 });
  }

  return NextResponse.json({ reminder });
}
