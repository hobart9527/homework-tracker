import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const SUPPORTED_PLATFORMS = new Set([
  "ixl",
  "khan-academy",
  "raz-kids",
  "epic",
] as const);

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json();
  const childId = payload.childId;
  const platform = payload.platform;
  const username = payload.username;
  const externalAccountRef = payload.externalAccountRef || username;

  if (!childId || !platform || !username) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (!SUPPORTED_PLATFORMS.has(platform)) {
    return NextResponse.json({ error: "Unsupported platform" }, { status: 400 });
  }

  const { data: child, error: childError } = await supabase
    .from("children")
    .select("id, parent_id")
    .eq("id", childId)
    .eq("parent_id", session.user.id)
    .single();

  if (childError || !child) {
    return NextResponse.json({ error: "Child not found" }, { status: 404 });
  }

  const { data: account, error: insertError } = await supabase
    .from("platform_accounts")
    .insert({
      child_id: childId,
      platform,
      external_account_ref: externalAccountRef,
      auth_mode: "account_password_managed_session",
      status: "attention_required",
    })
    .select()
    .single();

  if (insertError || !account) {
    const status = insertError?.message?.includes("platform_accounts_child_platform_account_key")
      ? 409
      : 500;

    return NextResponse.json(
      { error: insertError?.message || "Failed to create platform connection" },
      { status }
    );
  }

  return NextResponse.json({ success: true, account });
}
