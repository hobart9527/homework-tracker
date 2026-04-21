export type PlatformLoginResult =
  | {
      success: true;
      cookies: Array<{ name: string; value: string }>;
      message?: string;
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
    };

function parseSetCookieHeader(setCookieValue: string | null | undefined): Array<{ name: string; value: string }> {
  if (!setCookieValue) return [];

  const cookies: Array<{ name: string; value: string }> = [];
  const parts = setCookieValue.split(",");

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const name = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).split(";")[0].trim();
    if (name) {
      cookies.push({ name, value });
    }
  }

  return cookies;
}

function gatherCookiesFromResponse(response: Response): Array<{ name: string; value: string }> {
  const cookies: Array<{ name: string; value: string }> = [];
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) {
    cookies.push(...parseSetCookieHeader(setCookie));
  }
  return cookies;
}

/**
 * Attempt to log in to Khan Academy using username and password.
 *
 * NOTE: Khan Academy uses a modern SPA architecture with complex auth flows.
 * This implementation attempts the standard email/password path, but success
 * rates may be lower than IXL due to CSRF protections, fingerprinting, and
 * the prevalence of Google/Apple/Facebook login. If this fails, users should
 * fall back to manual session mode.
 */
export async function simulateKhanLogin(
  username: string,
  password: string,
  options?: { fetchImpl?: typeof fetch; timeoutMs?: number }
): Promise<PlatformLoginResult> {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const timeoutMs = options?.timeoutMs ?? 15000;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Step 1: GET the login page to collect cookies and any CSRF tokens
    const loginPageResponse = await fetchImpl("https://www.khanacademy.org/login", {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    const initialCookies = gatherCookiesFromResponse(loginPageResponse);
    const loginBody = await loginPageResponse.text().catch(() => "");

    // Detect Cloudflare / captcha challenges
    if (
      /cf-browser-verification|challenge-platform|turnstile|captcha/i.test(loginBody) ||
      loginPageResponse.status === 403
    ) {
      return {
        success: false,
        reason: "captcha_required",
        message:
          "Khan Academy is requiring a CAPTCHA challenge. Automatic login is not possible at this time.",
      };
    }

    // Extract CSRF token or fingerprinting tokens if present
    const csrfMatch = loginBody.match(/name=["']csrf_token["']\s+value=["']([^"']+)["']/i);
    const csrfToken = csrfMatch?.[1] ?? "";

    const fkeyMatch = loginBody.match(/"fkey"[:\s]*"([^"]+)"/i);
    const fkey = fkeyMatch?.[1] ?? "";

    const cookieHeader = initialCookies.map((c) => `${c.name}=${c.value}`).join("; ");

    // Step 2: POST login credentials
    // Khan Academy's login endpoint has historically been /api/internal/graphql/login
    // or a similar internal API. This is a best-effort attempt.
    const loginPayload: Record<string, unknown> = {
      email: username,
      password: password,
      ...(csrfToken ? { csrf_token: csrfToken } : {}),
      ...(fkey ? { fkey } : {}),
    };

    const loginResponse = await fetchImpl("https://www.khanacademy.org/api/internal/graphql/login", {
      method: "POST",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader,
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json",
        "X-KA-FKey": fkey || "",
        Referer: "https://www.khanacademy.org/login",
        Origin: "https://www.khanacademy.org",
      },
      body: JSON.stringify(loginPayload),
    });

    const loginResponseBody = await loginResponse.text().catch(() => "");

    // Detect CAPTCHA on login POST
    if (
      /cf-browser-verification|challenge-platform|turnstile|captcha/i.test(loginResponseBody) ||
      loginResponse.status === 403
    ) {
      return {
        success: false,
        reason: "captcha_required",
        message:
          "Khan Academy is requiring a CAPTCHA challenge. Automatic login is not possible at this time.",
      };
    }

    // Parse JSON response
    let jsonResult: Record<string, unknown> | null = null;
    try {
      jsonResult = JSON.parse(loginResponseBody);
    } catch {
      jsonResult = null;
    }

    if (jsonResult) {
      const error = jsonResult.error ?? jsonResult.errors;
      if (error) {
        const errorStr = JSON.stringify(error).toLowerCase();
        if (
          errorStr.includes("password") ||
          errorStr.includes("email") ||
          errorStr.includes("credential") ||
          errorStr.includes("invalid") ||
          errorStr.includes("incorrect")
        ) {
          return {
            success: false,
            reason: "invalid_credentials",
            message: "Invalid Khan Academy email or password.",
          };
        }
        if (errorStr.includes("captcha") || errorStr.includes("robot")) {
          return {
            success: false,
            reason: "captcha_required",
            message: "Khan Academy requires CAPTCHA verification. Please use manual session mode.",
          };
        }
        if (errorStr.includes("two-factor") || errorStr.includes("2fa") || errorStr.includes("verification")) {
          return {
            success: false,
            reason: "two_factor_required",
            message: "Khan Academy requires two-factor authentication. Please use manual session mode.",
          };
        }
        return {
          success: false,
          reason: "unknown",
          message: typeof error === "string" ? error : JSON.stringify(error),
        };
      }

      // Some Khan Academy login responses wrap data in a `data` field
      const data = jsonResult.data;
      if (data && typeof data === "object") {
        const loginData = data as Record<string, unknown>;
        if (loginData.user === null || loginData.user === undefined) {
          return {
            success: false,
            reason: "invalid_credentials",
            message: "Invalid Khan Academy email or password.",
          };
        }
      }
    }

    // Gather cookies from login response
    const loginCookies = gatherCookiesFromResponse(loginResponse);
    const allCookies = [...initialCookies, ...loginCookies];

    const cookieMap = new Map<string, string>();
    for (const c of allCookies) {
      cookieMap.set(c.name, c.value);
    }
    const finalCookies = Array.from(cookieMap.entries()).map(([name, value]) => ({ name, value }));

    // Verify by hitting the progress page
    const verifyCookieHeader = finalCookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const verifyResponse = await fetchImpl("https://www.khanacademy.org/progress", {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        Cookie: verifyCookieHeader,
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    const verifyBody = await verifyResponse.text().catch(() => "");

    if (
      verifyResponse.status === 401 ||
      /log in \| khan academy|sign up \| khan academy|login/i.test(verifyBody)
    ) {
      return {
        success: false,
        reason: "unsupported",
        message:
          "Khan Academy automatic login could not establish a valid session. The platform may have changed its login flow. Please use manual session mode.",
      };
    }

    return {
      success: true,
      cookies: finalCookies,
      message: "Khan Academy login successful.",
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        success: false,
        reason: "unknown",
        message:
          "Khan Academy login timed out. The platform may be unreachable or blocking automated requests.",
      };
    }

    return {
      success: false,
      reason: "unknown",
      message: error instanceof Error ? error.message : "Khan Academy login failed",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
