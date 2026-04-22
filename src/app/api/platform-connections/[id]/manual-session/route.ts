import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accountId = params.id;

  if (!accountId) {
    return NextResponse.json({ error: "Missing account ID" }, { status: 400 });
  }

  // Fetch the platform account and verify parent ownership
  const { data: account, error: accountError } = await supabase
    .from("platform_accounts")
    .select("*, children!inner(parent_id)")
    .eq("id", accountId)
    .single();

  if (accountError || !account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  if (account.children?.parent_id !== session.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const payload = await request.json().catch(() => ({}));

  const managedSessionPayload =
    payload.managedSessionPayload &&
    typeof payload.managedSessionPayload === "object"
      ? payload.managedSessionPayload
      : null;

  if (!managedSessionPayload) {
    return NextResponse.json(
      { error: "缺少 Managed Session JSON" },
      { status: 400 }
    );
  }

  const managedSessionCapturedAt =
    typeof payload.managedSessionCapturedAt === "string"
      ? payload.managedSessionCapturedAt
      : new Date().toISOString();

  const { error: updateError } = await supabase
    .from("platform_accounts")
    .update({
      managed_session_payload: managedSessionPayload,
      managed_session_captured_at: managedSessionCapturedAt,
      managed_session_expires_at: null,
      status: "active",
      last_sync_error_summary: null,
    })
    .eq("id", accountId);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message || "更新 Session 失败" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
