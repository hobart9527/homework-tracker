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
 * Log in to IXL using Playwright browser automation.
 *
 * NOTE: The old fetch-based implementation has been retired because
 * Cloudflare consistently blocks non-browser requests. This wrapper
 * delegates to the Playwright stealth script which simulates a real
 * user (warm-up, mouse movement, persistent context) for the best
 * success rate.
 */
export async function simulateIxlLogin(
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
    const { autoLoginIxl } = await import("@/lib/ixl-auto-login.mjs");
    const result = await autoLoginIxl(username, password, {
      onProgress: log,
    });
    return {
      success: true,
      cookies: result.cookies,
      message: "IXL 登录成功。",
      logs: result.logs,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "IXL login failed";
    log(`❌ ${msg}`);

    if (msg.includes("Invalid IXL credentials")) {
      return {
        success: false,
        reason: "invalid_credentials",
        message: "IXL 用户名或密码错误，请检查后重试。",
        logs,
      };
    }
    if (msg.includes("CAPTCHA")) {
      return {
        success: false,
        reason: "captcha_required",
        message: "IXL 当前要求验证码验证，请使用手动 Session 方式登录。",
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
