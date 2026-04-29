import { createClient } from "@/lib/supabase/server";
import { encryptCredential, decryptCredential } from "@/lib/crypto";
import { simulateIxlLogin } from "@/lib/platform-adapters/ixl-auth";
import { simulateKhanLogin } from "@/lib/platform-adapters/khan-auth";
import { NextResponse } from "next/server";

function getEncryptionKey(): string {
  const key = process.env.PLATFORM_CREDENTIALS_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("PLATFORM_CREDENTIALS_ENCRYPTION_KEY is not configured");
  }
  return key;
}

export async function POST(
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

  // Verify ownership via the child
  if (account.children?.parent_id !== session.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // If no encrypted credentials, cannot auto-refresh
  if (!account.login_credentials_encrypted) {
    return NextResponse.json(
      { error: "该账号未配置自动登录凭据，无法刷新 Session。" },
      { status: 400 }
    );
  }

  let credentials: { username: string; password: string };
  try {
    const key = getEncryptionKey();
    const decrypted = decryptCredential(account.login_credentials_encrypted, key);
    credentials = JSON.parse(decrypted);
  } catch {
    return NextResponse.json(
      { error: "解密登录凭据失败，请重新绑定账号。" },
      { status: 500 }
    );
  }

  const platform = account.platform;

  try {
    const loginResult =
      platform === "ixl"
        ? await simulateIxlLogin(credentials.username, credentials.password)
        : platform === "khan-academy"
          ? await simulateKhanLogin(credentials.username, credentials.password)
          : null;

    if (!loginResult) {
      return NextResponse.json(
        { error: "Unsupported platform for auto-login refresh" },
        { status: 400 }
      );
    }

    if (!loginResult.success) {
      // Update account status and error summary
      await supabase
        .from("platform_accounts")
        .update({
          status: "attention_required",
          last_sync_error_summary: loginResult.message,
        })
        .eq("id", accountId);

      return NextResponse.json(
        {
          error: loginResult.message,
          reason: loginResult.reason,
          hint:
            loginResult.reason === "captcha_required" ||
            loginResult.reason === "two_factor_required" ||
            loginResult.reason === "unsupported"
              ? "请切换到手动 Session 模式补录 Cookie。"
              : undefined,
        },
        { status: 400 }
      );
    }

    // Update the managed session payload
    const { error: updateError } = await supabase
      .from("platform_accounts")
      .update({
        managed_session_payload: { cookies: loginResult.cookies },
        managed_session_captured_at: new Date().toISOString(),
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

    return NextResponse.json({
      success: true,
      message: loginResult.message || "Session 刷新成功",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "刷新 Session 时发生未知错误",
      },
      { status: 500 }
    );
  }
}
