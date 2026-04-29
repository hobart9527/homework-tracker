export type PlatformLoginResult =
  | {
      success: true;
      cookies: Array<{ name: string; value: string }>;
      message?: string;
      logs?: string[];
    }
  | {
      success: false;
      reason:
        | "invalid_credentials"
        | "captcha_required"
        | "two_factor_required"
        | "unsupported"
        | "unknown";
      message: string;
      logs?: string[];
    };

/**
 * Log in to Khan Academy using Playwright browser automation.
 *
 * NOTE: The old fetch-based implementation has been retired because
 * Cloudflare consistently blocks non-browser requests. This wrapper
 * delegates to the Playwright stealth script which simulates a real
 * user (warm-up, mouse movement, persistent context) for the best
 * success rate.
 */
export async function simulateKhanLogin(
  username: string,
  password: string,
  options?: { fetchImpl?: typeof fetch; timeoutMs?: number; onProgress?: (msg: string) => void }
): Promise<PlatformLoginResult> {
  const logs: string[] = [];
  const log = (msg: string) => {
    logs.push(msg);
    options?.onProgress?.(msg);
  };

  try {
    const { autoLoginKhan } = await import("@/lib/khan-auto-login.mjs");
    const result = await autoLoginKhan(username, password, {
      onProgress: log,
    });
    return {
      success: true,
      cookies: result.cookies,
      message: "Khan Academy 登录成功。",
      logs: result.logs,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Khan Academy login failed";
    log(`❌ ${msg}`);

    if (msg.includes("Invalid") || msg.includes("credential") || msg.includes("password")) {
      return {
        success: false,
        reason: "invalid_credentials",
        message: "Khan Academy 邮箱或密码错误，请检查后重试。",
        logs,
      };
    }
    if (msg.includes("CAPTCHA")) {
      return {
        success: false,
        reason: "captcha_required",
        message: "Khan Academy 当前要求验证码验证，请使用手动 Session 方式登录。",
        logs,
      };
    }

    return {
      success: false,
      reason: "unknown",
      message: msg,
      logs,
    };
  }
}
