import { createClient } from "@/lib/supabase/server";
import { encryptCredential } from "@/lib/crypto";
import { simulateIxlLogin } from "@/lib/platform-adapters/ixl-auth";
import { simulateKhanLogin } from "@/lib/platform-adapters/khan-auth";
import { NextResponse } from "next/server";

const SUPPORTED_PLATFORMS = new Set([
  "ixl",
  "khan-academy",
  "raz-kids",
  "epic",
] as const);

function getManualSessionGuide(platform: string) {
  if (platform === "ixl") {
    return {
      manualSessionUrl: "https://www.ixl.com/signin",
      manualSessionTemplate: {
        cookies: [
          { name: "PHPSESSID", value: "" },
          { name: "ixl_user", value: "" },
        ],
      },
    };
  }

  if (platform === "epic") {
    return {
      manualSessionUrl: "https://www.getepic.com/sign-in/parent",
      manualSessionTemplate: {
        activityUrl: "",
        cookies: [],
      },
    };
  }

  if (platform === "raz-kids") {
    return {
      manualSessionUrl: "https://www.raz-kids.com/",
      manualSessionTemplate: {
        activityUrl: "",
        cookies: [],
      },
    };
  }

  return {
    manualSessionUrl: "https://www.khanacademy.org/login",
    manualSessionTemplate: {
      cookies: [
        { name: "KAAS", value: "" },
      ],
    },
  };
}

function getEncryptionKey(): string {
  const key = process.env.PLATFORM_CREDENTIALS_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("PLATFORM_CREDENTIALS_ENCRYPTION_KEY is not configured");
  }
  return key;
}

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
  const authMode = payload.authMode === "auto_login" ? "auto_login" : "manual_session";
  const loginUsername =
    typeof payload.loginUsername === "string" ? payload.loginUsername.trim() : "";
  const loginPassword =
    typeof payload.loginPassword === "string" ? payload.loginPassword : "";

  const managedSessionPayload =
    payload.managedSessionPayload &&
    typeof payload.managedSessionPayload === "object"
      ? payload.managedSessionPayload
      : null;
  const managedSessionCapturedAt =
    typeof payload.managedSessionCapturedAt === "string"
      ? payload.managedSessionCapturedAt
      : null;

  if (!childId || !platform || !username) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (!SUPPORTED_PLATFORMS.has(platform)) {
    return NextResponse.json(
      {
        error:
          "Unsupported platform. Supported platforms are IXL, Khan Academy, Raz-Kids, and Epic.",
      },
      { status: 400 }
    );
  }

  if (
    authMode === "auto_login" &&
    platform !== "ixl" &&
    platform !== "khan-academy"
  ) {
    const guide = getManualSessionGuide(platform);
    return NextResponse.json(
      {
        error: `${platform} 目前只支持手动 Session 绑定。`,
        reason: "unsupported",
        hint: "请切换到手动 Session 模式完成绑定。",
        ...guide,
      },
      { status: 400 }
    );
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

  let finalManagedSessionPayload = managedSessionPayload;
  let finalManagedSessionCapturedAt = managedSessionCapturedAt;
  let finalStatus: "active" | "attention_required" = managedSessionPayload
    ? "active"
    : "attention_required";
  let loginCredentialsEncrypted: string | null = null;
  let autoLoginEnabled = false;

  // Auto-login mode
  if (authMode === "auto_login" && loginPassword) {
    try {
      const loginResult =
        platform === "ixl"
          ? await simulateIxlLogin(loginUsername || username, loginPassword)
          : await simulateKhanLogin(loginUsername || username, loginPassword);

      if (loginResult.success) {
        finalManagedSessionPayload = {
          cookies: loginResult.cookies,
        };
        finalManagedSessionCapturedAt = new Date().toISOString();
        finalStatus = "active";
      } else {
        // For captcha/2FA/unsupported: still save credentials so user can retry later,
        // but mark as attention_required
        if (
          loginResult.reason === "captcha_required" ||
          loginResult.reason === "two_factor_required" ||
          loginResult.reason === "unsupported"
        ) {
          finalStatus = "attention_required";
        } else if (loginResult.reason === "invalid_credentials") {
          return NextResponse.json(
            { error: loginResult.message, reason: loginResult.reason },
            { status: 401 }
          );
        } else {
          finalStatus = "attention_required";
        }

        return NextResponse.json(
          {
            error: loginResult.message,
            reason: loginResult.reason,
            hint:
              loginResult.reason === "captcha_required" ||
              loginResult.reason === "two_factor_required" ||
              loginResult.reason === "unsupported"
                ? "请切换到手动 Session 模式完成绑定。"
                : undefined,
            ...(loginResult.reason === "captcha_required" ||
            loginResult.reason === "two_factor_required" ||
            loginResult.reason === "unsupported"
              ? getManualSessionGuide(platform)
              : {}),
          },
          { status: 400 }
        );
      }
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "自动登录尝试失败",
        },
        { status: 500 }
      );
    }

    // Encrypt and store credentials
    try {
      const key = getEncryptionKey();
      const credentialsJson = JSON.stringify({
        username: loginUsername || username,
        password: loginPassword,
      });
      loginCredentialsEncrypted = encryptCredential(credentialsJson, key);
      autoLoginEnabled = true;
    } catch (error) {
      return NextResponse.json(
        {
          error: "加密登录凭据失败，请检查服务端加密密钥配置。",
        },
        { status: 500 }
      );
    }
  }

  // Check if an account with the same (child_id, platform, external_account_ref) already exists
  const { data: existingAccount } = await supabase
    .from("platform_accounts")
    .select("id, login_credentials_encrypted, auto_login_enabled")
    .eq("child_id", childId)
    .eq("platform", platform)
    .eq("external_account_ref", externalAccountRef)
    .single();

  if (existingAccount) {
    // Preserve existing credentials when updating in manual session mode
    const effectiveCredentials =
      authMode === "auto_login"
        ? loginCredentialsEncrypted
        : existingAccount.login_credentials_encrypted;
    const effectiveAutoLogin =
      authMode === "auto_login"
        ? autoLoginEnabled
        : existingAccount.auto_login_enabled;

    const { data: updatedAccount, error: updateError } = await supabase
      .from("platform_accounts")
      .update({
        auth_mode: authMode,
        status: finalStatus,
        managed_session_payload: finalManagedSessionPayload,
        managed_session_captured_at: finalManagedSessionCapturedAt,
        login_credentials_encrypted: effectiveCredentials,
        auto_login_enabled: effectiveAutoLogin,
        last_sync_error_summary: null,
      })
      .eq("id", existingAccount.id)
      .select()
      .single();

    if (updateError || !updatedAccount) {
      return NextResponse.json(
        { error: updateError?.message || "Failed to update platform connection" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, account: updatedAccount });
  }

  const { data: account, error: insertError } = await supabase
    .from("platform_accounts")
    .insert({
      child_id: childId,
      platform,
      external_account_ref: externalAccountRef,
      auth_mode: authMode,
      status: finalStatus,
      managed_session_payload: finalManagedSessionPayload,
      managed_session_captured_at: finalManagedSessionCapturedAt,
      login_credentials_encrypted: loginCredentialsEncrypted,
      auto_login_enabled: autoLoginEnabled,
      last_sync_error_summary: null,
    })
    .select()
    .single();

  if (insertError || !account) {
    return NextResponse.json(
      { error: insertError?.message || "Failed to create platform connection" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, account });
}
