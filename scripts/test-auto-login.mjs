#!/usr/bin/env node

import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * 自动登录测试脚本
 *
 * 测试 IXL 和 Khan Academy 的自动登录功能，支持两种模式：
 *   --mode=fetch      测试 fetch-based 自动登录
 *   --mode=playwright 测试 Playwright 浏览器模拟登录（默认）
 *
 * 用法：
 *   node scripts/test-auto-login.mjs --platform=ixl --username=xxx --password=xxx
 *   node scripts/test-auto-login.mjs --platform=khan-academy --mode=fetch
 *
 * 如果未提供凭据，会尝试从 .env.local 读取 IXL_USERNAME/IXL_PASSWORD 或 KHAN_USERNAME/KHAN_PASSWORD。
 */

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--")) {
      const idx = arg.indexOf("=");
      if (idx !== -1) {
        args[arg.slice(2, idx)] = arg.slice(idx + 1);
      } else {
        args[arg.slice(2)] = true;
      }
    }
  }
  return args;
}

function parseSetCookieHeader(setCookieValue) {
  if (!setCookieValue) return [];
  const cookies = [];
  const parts = setCookieValue.split(",");
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const name = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).split(";")[0].trim();
    if (name) cookies.push({ name, value });
  }
  return cookies;
}

function gatherCookiesFromResponse(response) {
  const cookies = [];
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookies.push(...parseSetCookieHeader(setCookie));
  return cookies;
}

function isIxlLoginPage(html) {
  return (
    /<title>\s*(sign in to ixl|log in to ixl|signin)\s*<\/title>/i.test(html) ||
    /<form[^>]+action=["'][^"']*\/signin/i.test(html) ||
    /<input[^>]+type=["']password["']/i.test(html)
  );
}

const args = parseArgs();
const platform = args.platform || "ixl";
const mode = args.mode || "playwright";

let username = args.username;
let password = args.password;

if (!username || !password) {
  if (platform === "ixl") {
    username = process.env.IXL_USERNAME;
    password = process.env.IXL_PASSWORD;
  } else if (platform === "khan-academy") {
    username = process.env.KHAN_USERNAME;
    password = process.env.KHAN_PASSWORD;
  }
}

if (!username || !password) {
  console.error("❌ 缺少凭据。请通过参数提供或配置环境变量：");
  console.error("   --username=xxx --password=xxx");
  console.error("   或 IXL_USERNAME / IXL_PASSWORD / KHAN_USERNAME / KHAN_PASSWORD");
  process.exit(1);
}

console.log(`\n🔧 测试平台: ${platform}`);
console.log(`🔧 测试模式: ${mode}`);
console.log(`🔧 账号: ${username}`);
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

async function testFetchIxl() {
  const startTime = Date.now();
  const logs = [];
  const log = (msg) => { logs.push(msg); console.log(`   ${msg}`); };

  try {
    log("🌐 正在连接 IXL 登录页 (fetch)...");
    const signinPageResponse = await fetch("https://www.ixl.com/signin", {
      method: "GET",
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
        DNT: "1",
      },
    });

    const initialCookies = gatherCookiesFromResponse(signinPageResponse);
    log(`📥 获取初始 Cookie: ${initialCookies.map((c) => c.name).join(", ") || "无"}`);

    const signinBody = await signinPageResponse.text().catch(() => "");

    if (/cf-browser-verification|challenge-platform|turnstile|captcha/i.test(signinBody) || signinPageResponse.status === 403) {
      log("🛑 检测到验证码/Cloudflare 挑战，fetch 自动登录不可用");
      return { success: false, reason: "captcha_required", message: "IXL 当前要求验证码验证", logs };
    }

    const authTokenMatch = signinBody.match(/name=["']authToken["']\s+value=["']([^"']+)["']/i);
    const authToken = authTokenMatch?.[1] ?? "";
    const cookieHeader = initialCookies.map((c) => `${c.name}=${c.value}`).join("; ");

    log(`🔑 正在提交登录凭据 (用户名: ${username})...`);
    const loginBody = new URLSearchParams();
    loginBody.append("username", username);
    loginBody.append("password", password);
    if (authToken) loginBody.append("authToken", authToken);

    const loginResponse = await fetch("https://www.ixl.com/signin/ajax", {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookieHeader,
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        Accept: "application/json, text/javascript, */*;q=0.01",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "X-Requested-With": "XMLHttpRequest",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
        Referer: "https://www.ixl.com/signin",
        Origin: "https://www.ixl.com",
      },
      body: loginBody.toString(),
    });

    const loginResponseBody = await loginResponse.text().catch(() => "");
    log(`📨 登录响应状态: ${loginResponse.status}`);

    if (/cf-browser-verification|challenge-platform|turnstile|captcha/i.test(loginResponseBody) || loginResponse.status === 403) {
      log("🛑 登录时检测到验证码/Cloudflare 挑战");
      return { success: false, reason: "captcha_required", message: "IXL 登录时要求验证码验证", logs };
    }

    const loginCookies = gatherCookiesFromResponse(loginResponse);
    log(`📥 登录响应 Cookie: ${loginCookies.map((c) => c.name).join(", ") || "无"}`);

    const allCookies = [...initialCookies, ...loginCookies];
    const cookieMap = new Map();
    for (const c of allCookies) cookieMap.set(c.name, c.value);
    const finalCookies = Array.from(cookieMap.entries()).map(([name, value]) => ({ name, value }));

    const verifyCookieHeader = finalCookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const verifyResponse = await fetch("https://www.ixl.com/analytics/student-usage", {
      method: "GET",
      redirect: "manual",
      headers: {
        Cookie: verifyCookieHeader,
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Upgrade-Insecure-Requests": "1",
      },
    });

    const verifyBody = await verifyResponse.text().catch(() => "");
    if (verifyResponse.status === 401 || isIxlLoginPage(verifyBody)) {
      log("❌ Session 验证失败");
      return { success: false, reason: "invalid_credentials", message: "IXL 用户名或密码错误", logs };
    }

    const duration = Date.now() - startTime;
    log(`✅ IXL fetch 登录成功 (${duration}ms)`);
    return { success: true, cookies: finalCookies, logs };
  } catch (error) {
    const duration = Date.now() - startTime;
    const msg = error instanceof Error ? error.message : "未知错误";
    log(`💥 异常 (${duration}ms): ${msg}`);
    return { success: false, reason: "unknown", message: msg, logs };
  }
}

async function testFetchKhan() {
  const startTime = Date.now();
  const logs = [];
  const log = (msg) => { logs.push(msg); console.log(`   ${msg}`); };

  try {
    log("🌐 正在连接 Khan Academy 登录页 (fetch)...");
    const loginPageResponse = await fetch("https://www.khanacademy.org/login", {
      method: "GET",
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
        DNT: "1",
      },
    });

    const initialCookies = gatherCookiesFromResponse(loginPageResponse);
    log(`📥 获取初始 Cookie: ${initialCookies.map((c) => c.name).join(", ") || "无"}`);

    const loginBody = await loginPageResponse.text().catch(() => "");
    if (/cf-browser-verification|challenge-platform|turnstile|captcha/i.test(loginBody) || loginPageResponse.status === 403) {
      log("🛑 检测到验证码/Cloudflare 挑战");
      return { success: false, reason: "captcha_required", message: "Khan Academy 当前要求验证码验证", logs };
    }

    const csrfMatch = loginBody.match(/name=["']csrf_token["']\s+value=["']([^"']+)["']/i);
    const csrfToken = csrfMatch?.[1] ?? "";
    const fkeyMatch = loginBody.match(/"fkey"[:\s]*"([^"]+)"/i);
    const fkey = fkeyMatch?.[1] ?? "";
    const cookieHeader = initialCookies.map((c) => `${c.name}=${c.value}`).join("; ");

    log(`🔑 正在提交登录凭据 (邮箱: ${username})...`);
    const loginPayload = { email: username, password, ...(csrfToken ? { csrf_token: csrfToken } : {}), ...(fkey ? { fkey } : {}) };

    const loginResponse = await fetch("https://www.khanacademy.org/api/internal/graphql/login", {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader,
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        Accept: "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "X-KA-FKey": fkey || "",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
        Referer: "https://www.khanacademy.org/login",
        Origin: "https://www.khanacademy.org",
      },
      body: JSON.stringify(loginPayload),
    });

    const loginResponseBody = await loginResponse.text().catch(() => "");
    log(`📨 登录响应状态: ${loginResponse.status}`);

    if (/cf-browser-verification|challenge-platform|turnstile|captcha/i.test(loginResponseBody) || loginResponse.status === 403) {
      log("🛑 登录时检测到验证码/Cloudflare 挑战");
      return { success: false, reason: "captcha_required", message: "Khan Academy 登录时要求验证码验证", logs };
    }

    let jsonResult = null;
    try { jsonResult = JSON.parse(loginResponseBody); } catch { /* ignore */ }

    if (jsonResult) {
      const error = jsonResult.error ?? jsonResult.errors;
      if (error) {
        const errorStr = JSON.stringify(error).toLowerCase();
        log(`❌ 登录被拒绝: ${errorStr}`);
        if (errorStr.includes("password") || errorStr.includes("email") || errorStr.includes("credential") || errorStr.includes("invalid") || errorStr.includes("incorrect")) {
          return { success: false, reason: "invalid_credentials", message: "Khan Academy 邮箱或密码错误", logs };
        }
        return { success: false, reason: "unknown", message: typeof error === "string" ? error : JSON.stringify(error), logs };
      }
    }

    const loginCookies = gatherCookiesFromResponse(loginResponse);
    const allCookies = [...initialCookies, ...loginCookies];
    const cookieMap = new Map();
    for (const c of allCookies) cookieMap.set(c.name, c.value);
    const finalCookies = Array.from(cookieMap.entries()).map(([name, value]) => ({ name, value }));

    const verifyCookieHeader = finalCookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const verifyResponse = await fetch("https://www.khanacademy.org/progress", {
      method: "GET",
      redirect: "manual",
      headers: {
        Cookie: verifyCookieHeader,
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Upgrade-Insecure-Requests": "1",
      },
    });

    const verifyBody = await verifyResponse.text().catch(() => "");
    if (verifyResponse.status === 401 || /log in \| khan academy|sign up \| khan academy|login/i.test(verifyBody)) {
      log("❌ Session 验证失败");
      return { success: false, reason: "unsupported", message: "Khan Academy 自动登录无法建立有效 Session", logs };
    }

    const duration = Date.now() - startTime;
    log(`✅ Khan Academy fetch 登录成功 (${duration}ms)`);
    return { success: true, cookies: finalCookies, logs };
  } catch (error) {
    const duration = Date.now() - startTime;
    const msg = error instanceof Error ? error.message : "未知错误";
    log(`💥 异常 (${duration}ms): ${msg}`);
    return { success: false, reason: "unknown", message: msg, logs };
  }
}

async function testPlaywrightIxl() {
  const startTime = Date.now();
  try {
    const { autoLoginIxl } = await import("../src/lib/ixl-auto-login.mjs");
    const result = await autoLoginIxl(username, password, {
      onProgress: (msg) => console.log(`   ${msg}`),
    });
    const duration = Date.now() - startTime;
    console.log(`\n✅ IXL Playwright 登录成功 (${duration}ms)`);
    console.log(`   Cookie 数量: ${result.cookies.length}`);
    console.log(`   Session cookies: ${result.cookies.filter(c => ["PHPSESSID", "ixlid", "ixl_user", "is_logged_in"].some(n => c.name.toLowerCase().includes(n.toLowerCase()))).map(c => c.name).join(", ") || "无"}`);
    return { success: true, cookies: result.cookies, logs: result.logs };
  } catch (err) {
    const duration = Date.now() - startTime;
    const msg = err instanceof Error ? err.message : "未知错误";
    console.log(`\n❌ IXL Playwright 登录失败 (${duration}ms): ${msg}`);
    return { success: false, reason: "error", message: msg };
  }
}

async function testPlaywrightKhan() {
  const startTime = Date.now();
  try {
    const { autoLoginKhan } = await import("../src/lib/khan-auto-login.mjs");
    const result = await autoLoginKhan(username, password, {
      onProgress: (msg) => console.log(`   ${msg}`),
    });
    const duration = Date.now() - startTime;
    console.log(`\n✅ Khan Academy Playwright 登录成功 (${duration}ms)`);
    console.log(`   Cookie 数量: ${result.cookies.length}`);
    console.log(`   Session cookies: ${result.cookies.filter(c => ["KAAS", "fkey", "ka_session"].some(n => c.name.toLowerCase().includes(n.toLowerCase()))).map(c => c.name).join(", ") || "无"}`);
    return { success: true, cookies: result.cookies, logs: result.logs };
  } catch (err) {
    const duration = Date.now() - startTime;
    const msg = err instanceof Error ? err.message : "未知错误";
    console.log(`\n❌ Khan Academy Playwright 登录失败 (${duration}ms): ${msg}`);
    return { success: false, reason: "error", message: msg };
  }
}

async function main() {
  let result;

  if (mode === "fetch") {
    if (platform === "ixl") {
      result = await testFetchIxl();
    } else if (platform === "khan-academy") {
      result = await testFetchKhan();
    } else {
      console.error(`❌ 不支持的平台: ${platform}`);
      process.exit(1);
    }
  } else if (mode === "playwright") {
    if (platform === "ixl") {
      result = await testPlaywrightIxl();
    } else if (platform === "khan-academy") {
      result = await testPlaywrightKhan();
    } else {
      console.error(`❌ 不支持的平台: ${platform}`);
      process.exit(1);
    }
  } else {
    console.error(`❌ 不支持的模式: ${mode}。请使用 fetch 或 playwright`);
    process.exit(1);
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  if (result.success) {
    console.log("✅ 测试通过");
  } else {
    console.log(`❌ 测试失败: ${result.message}`);
    console.log(`   原因: ${result.reason}`);
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

main().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
