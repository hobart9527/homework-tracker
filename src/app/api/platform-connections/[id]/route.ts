import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function DELETE(
  _request: Request,
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

  const { error: deleteError } = await supabase
    .from("platform_accounts")
    .delete()
    .eq("id", accountId);

  if (deleteError) {
    return NextResponse.json(
      { error: deleteError.message || "删除账号失败" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
