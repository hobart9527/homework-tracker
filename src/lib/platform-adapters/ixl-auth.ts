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
  // Handle multiple Set-Cookie headers joined by comma (or passed as array later)
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
 * Attempt to log in to IXL using username and password.
 *
 * NOTE: This implementation is based on the standard IXL web login flow.
 * The specific endpoints and form parameters may change and should be
 * calibrated against real network traffic if login failures occur.
 */
export async function simulateIxlLogin(
  username: string,
  password: string,
  options?: { fetchImpl?: typeof fetch; timeoutMs?: number }
): Promise<PlatformLoginResult> {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const timeoutMs = options?.timeoutMs ?? 15000;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Step 1: GET the signin page to collect any required cookies/tokens
    const signinPageResponse = await fetchImpl("https://www.ixl.com/signin", {
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

    const initialCookies = gatherCookiesFromResponse(signinPageResponse);
    const signinBody = await signinPageResponse.text().catch(() => "");

    // Detect Cloudflare / captcha challenges on the login page itself
    if (
      /cf-browser-verification|challenge-platform|turnstile|captcha/i.test(signinBody) ||
      signinPageResponse.status === 403
    ) {
      return {
        success: false,
        reason: "captcha_required",
        message: "IXL is requiring a CAPTCHA challenge. Automatic login is not possible at this time.",
      };
    }

    // Extract any CSRF-like token from the page if present
    const authTokenMatch = signinBody.match(
      /name=["']authToken["']\s+value=["']([^"']+)["']/i
    );
    const authToken = authTokenMatch?.[1] ?? "";

    // Build cookie header for the login request
    const cookieHeader = initialCookies.map((c) => `${c.name}=${c.value}`).join("; ");

    // Step 2: POST login credentials
    // IXL login endpoint may vary; this is the most common candidate.
    const loginBody = new URLSearchParams();
    loginBody.append("username", username);
    loginBody.append("password", password);
    if (authToken) {
      loginBody.append("authToken", authToken);
    }

    const loginResponse = await fetchImpl("https://www.ixl.com/signin/ajax", {
      method: "POST",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookieHeader,
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json, text/javascript, */*",
        "X-Requested-With": "XMLHttpRequest",
        Referer: "https://www.ixl.com/signin",
      },
      body: loginBody.toString(),
    });

    const loginResponseBody = await loginResponse.text().catch(() => "");

    // Detect Cloudflare / captcha on login POST
    if (
      /cf-browser-verification|challenge-platform|turnstile|captcha/i.test(loginResponseBody) ||
      loginResponse.status === 403
    ) {
      return {
        success: false,
        reason: "captcha_required",
        message: "IXL is requiring a CAPTCHA challenge. Automatic login is not possible at this time.",
      };
    }

    // Try to parse JSON response; IXL sometimes returns JSON with auth result
    let jsonResult: Record<string, unknown> | null = null;
    try {
      jsonResult = JSON.parse(loginResponseBody);
    } catch {
      jsonResult = null;
    }

    // Check for known error indicators in JSON
    if (jsonResult) {
      const authenticated = jsonResult.authenticated ?? jsonResult.success ?? jsonResult.loggedIn;
      const errorMessage = jsonResult.error ?? jsonResult.message ?? jsonResult.errorMessage;

      if (authenticated === false || errorMessage) {
        const msg = String(errorMessage || "Invalid IXL credentials").toLowerCase();
        if (msg.includes("password") || msg.includes("username") || msg.includes("credential") || msg.includes("incorrect")) {
          return {
            success: false,
            reason: "invalid_credentials",
            message: "Invalid IXL username or password.",
          };
        }
        return {
          success: false,
          reason: "unknown",
          message: String(errorMessage || "IXL login failed"),
        };
      }
    }

    // Gather cookies from login response
    const loginCookies = gatherCookiesFromResponse(loginResponse);
    const allCookies = [...initialCookies, ...loginCookies];

    // Deduplicate by name (later values win)
    const cookieMap = new Map<string, string>();
    for (const c of allCookies) {
      cookieMap.set(c.name, c.value);
    }
    const finalCookies = Array.from(cookieMap.entries()).map(([name, value]) => ({ name, value }));

    // Verify we got a session cookie (common names)
    const sessionCookieNames = ["PHPSESSID", "ixlid", "ixl_user", "sess", "session"];
    const hasSessionCookie = finalCookies.some((c) =>
      sessionCookieNames.some((name) => c.name.toLowerCase().includes(name.toLowerCase()))
    );

    // Also verify by hitting the activity page
    const verifyCookieHeader = finalCookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const verifyResponse = await fetchImpl("https://www.ixl.com/membership/account/activity", {
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
      /sign in to ixl|log in to ixl|signin/i.test(verifyBody)
    ) {
      // If JSON said success but cookie doesn't work, something changed
      if (jsonResult && (jsonResult.authenticated === true || jsonResult.success === true)) {
        return {
          success: false,
          reason: "unsupported",
          message: "IXL login response format may have changed. Please use manual session mode.",
        };
      }

      return {
        success: false,
        reason: "invalid_credentials",
        message: "Invalid IXL username or password (session verification failed).",
      };
    }

    if (!hasSessionCookie && finalCookies.length === 0) {
      return {
        success: false,
        reason: "unknown",
        message: "IXL login did not return any session cookies.",
      };
    }

    return {
      success: true,
      cookies: finalCookies,
      message: "IXL login successful.",
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        success: false,
        reason: "unknown",
        message: "IXL login timed out. The platform may be unreachable or blocking automated requests.",
      };
    }

    return {
      success: false,
      reason: "unknown",
      message: error instanceof Error ? error.message : "IXL login failed",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
