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

  const { child_id, homework_id, type } = await request.json();

  // Get parent settings
  const { data: parent } = await supabase
    .from("parents")
    .select("*")
    .eq("id", session.user.id)
    .single();

  if (!parent) {
    return NextResponse.json({ error: "Parent not found" }, { status: 404 });
  }

  // Get child info
  const { data: child } = await supabase
    .from("children")
    .select("*")
    .eq("id", child_id)
    .single();

  // Get homework info
  const { data: homework } = await supabase
    .from("homeworks")
    .select("*")
    .eq("id", homework_id)
    .single();

  // Send reminder via configured channel (WeChat/iMessage)
  // This is a placeholder - actual implementation depends on the notification service
  console.log(`Sending ${type} reminder for ${child?.name} - ${homework?.title}`);

  return NextResponse.json({ success: true });
}