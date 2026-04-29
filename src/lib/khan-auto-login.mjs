import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

chromium.use(StealthPlugin());

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

/** Get or create a persistent user data directory for a given account */
function getUserDataDir(username) {
  const baseDir = join(tmpdir(), "homework-tracker-playwright", "khan");
  const userDir = join(baseDir, Buffer.from(username).toString("base64url"));
  if (!existsSync(userDir)) {
    mkdirSync(userDir, { recursive: true });
  }
  return userDir;
}

async function humanType(page, selector, text) {
  for (const ch of text) {
    await page.type(selector, ch, { delay: rand(50, 180) });
    if (Math.random() < 0.05) {
      await page.waitForTimeout(rand(200, 600));
    }
  }
}

async function humanClick(page, selector) {
  const el = page.locator(selector);
  const box = await el.boundingBox();
  if (box) {
    await page.mouse.move(
      box.x + rand(10, box.width - 10),
      box.y + rand(5, box.height - 5),
      { steps: rand(3, 8) }
    );
  }
  await page.mouse.down();
  await page.waitForTimeout(rand(50, 150));
  await page.mouse.up();
}

/** Simulate random mouse movement across the page */
async function randomMouseWander(page) {
  const viewport = page.viewportSize();
  if (!viewport) return;
  const points = rand(2, 5);
  for (let i = 0; i < points; i++) {
    const x = rand(50, viewport.width - 50);
    const y = rand(50, viewport.height - 50);
    await page.mouse.move(x, y, { steps: rand(5, 15) });
    await page.waitForTimeout(rand(100, 400));
  }
}

/** Simulate human-like scrolling */
async function humanScroll(page) {
  const scrolls = rand(1, 3);
  for (let i = 0; i < scrolls; i++) {
    const amount = rand(100, 400);
    await page.mouse.wheel(0, amount);
    await page.waitForTimeout(rand(300, 800));
  }
}

/**
 * Headless login to Khan Academy. Server-ready: stealth + headless Chromium.
 *
 * @param {string} username
 * @param {string} password
 * @param {object} [options]
 * @param {function} [options.onProgress] - Callback for log messages
 * @returns {Promise<{cookies: Array<{name: string, value: string}>, logs: string[]}>}
 */
export async function autoLoginKhan(username, password, options = {}) {
  const logs = [];
  const log = (msg) => {
    logs.push(msg);
    options?.onProgress?.(msg);
  };

  const userDataDir = getUserDataDir(username);

  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process,AutomationControlled",
      "--disable-dev-shm-usage",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-web-security",
      "--disable-features=BlockInsecurePrivateNetworkRequests",
    ],
    viewport: {
      width: rand(1280, 1440),
      height: rand(800, 900),
    },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    locale: "en-US",
    timezoneId: "America/New_York",
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9",
      "sec-ch-ua": '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"macOS"',
    },
  });

  try {
    const page = browser.pages()[0] || (await browser.newPage());

    // Clear stale login cookies from previous sessions so we always start fresh
    // but keep Cloudflare/session integrity cookies
    const existingCookies = await browser.cookies("https://www.khanacademy.org");
    const cookiesToClear = existingCookies.filter((c) =>
      ["KAAS", "KAAL", "KAAC", "fkey", "ka_session", "reauth_token", "did_reauth"].includes(c.name)
    );
    if (cookiesToClear.length > 0) {
      await browser.clearCookies(cookiesToClear.map((c) => ({ name: c.name, domain: c.domain, path: c.path })));
    }

    await browser.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", {
        get: () => undefined,
      });
      Object.defineProperty(navigator, "plugins", {
        get: () => [1, 2, 3, 4, 5],
      });
      window.chrome = { runtime: {} };
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) =>
        parameters.name === "notifications"
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery(parameters);
    });

    // ===== Warm-up: visit homepage like a real user =====
    log("🌐 访问 Khan Academy 首页...");
    await page.goto("https://www.khanacademy.org", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    await page.waitForTimeout(rand(2000, 4000));
    await randomMouseWander(page);
    await humanScroll(page);
    await page.waitForTimeout(rand(1000, 2500));

    // Warm-up complete — now navigate to login page directly.
    // We already have domain cookies from the homepage visit.
    log("🔗 导航到登录页...");
    await page.goto("https://www.khanacademy.org/login", {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    await page.waitForTimeout(rand(2000, 4000));

    // Check for Cloudflare "Checking your browser" page
    let attempts = 0;
    while (attempts < 8) {
      const bodyText = await page.textContent("body").catch(() => "");
      const html = await page.content().catch(() => "");

      if (
        bodyText.includes("Checking your browser") ||
        bodyText.includes("cf-browser-verification")
      ) {
        log(
          "⏳ Cloudflare 正在检查浏览器，继续等待... (" +
            (attempts + 1) +
            "/8)"
        );
        await page.waitForTimeout(5000);
        attempts++;
        continue;
      }

      const hasUsernameInput =
        (await page.locator(
          'input[name="identifier"], input[type="email"], input#identifier, input[name="username"]'
        ).count()) > 0;
      if (hasUsernameInput) {
        break;
      }

      if (/turnstile|captcha|challenge-platform/i.test(html) && attempts >= 3) {
        log("🛑 检测到 CAPTCHA/验证码挑战");
        throw new Error("CAPTCHA challenge detected on Khan Academy login page");
      }

      log("⏳ 等待登录表单加载... (" + (attempts + 1) + "/8)");
      await page.waitForTimeout(3000);
      attempts++;
    }

    // Dismiss cookie consent banner if present
    const acceptCookiesBtn = page.locator(
      'button:has-text("Accept All Cookies")'
    );
    if ((await acceptCookiesBtn.count()) > 0) {
      try {
        await acceptCookiesBtn.click();
        await page.waitForTimeout(rand(500, 1000));
      } catch {
        // ignore
      }
    }

    await randomMouseWander(page);
    await page.waitForTimeout(rand(300, 700));

    // Find username field with multiple selectors
    const usernameSelectors = [
      'input[name="identifier"]',
      'input[type="email"]',
      'input#identifier',
      'input[name="username"]',
    ];
    let usernameFound = false;
    for (const sel of usernameSelectors) {
      if ((await page.locator(sel).count()) > 0) {
        log("⌨️  输入邮箱...");
        await humanType(page, sel, username);
        usernameFound = true;
        break;
      }
    }
    if (!usernameFound) {
      throw new Error(
        "Could not find username/email input field on Khan Academy login page"
      );
    }

    await page.waitForTimeout(rand(400, 900));

    // Find password field
    const passwordSelectors = [
      'input[name="password"]',
      'input[type="password"]',
      'input[name="current-password"]',
    ];
    let passwordFound = false;
    for (const sel of passwordSelectors) {
      if ((await page.locator(sel).count()) > 0) {
        log("⌨️  输入密码...");
        await humanType(page, sel, password);
        passwordFound = true;
        break;
      }
    }
    if (!passwordFound) {
      throw new Error(
        "Could not find password input field on Khan Academy login page"
      );
    }

    await page.waitForTimeout(rand(600, 1400));
    await randomMouseWander(page);

    // Find and click login button
    const loginBtnSelectors = [
      'button[type="submit"]:has-text("Log in")',
      'button[type="submit"]',
      'button:has-text("Sign in")',
      'input[type="submit"]',
    ];
    let loginBtnFound = false;
    for (const sel of loginBtnSelectors) {
      if ((await page.locator(sel).count()) > 0) {
        log("🖱️  点击登录...");
        await humanClick(page, sel);
        loginBtnFound = true;
        break;
      }
    }
    if (!loginBtnFound) {
      throw new Error("Could not find login button on Khan Academy login page");
    }

    log("⏳ 等待登录响应...");
    await page.waitForTimeout(rand(5000, 8000));
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    // Gather cookies
    const cookies = await browser.cookies();
    const hasKaaS = cookies.some((c) => c.name === "KAAS");
    const hasFkey = cookies.some((c) => c.name === "fkey");

    log(`📥 Cookie: ${cookies.map((c) => c.name).join(", ") || "无"}`);

    if (!hasKaaS && !hasFkey) {
      const errorMsg = await page.evaluate(() => {
        const alerts = document.querySelectorAll('[role="alert"]');
        const errorDivs = document.querySelectorAll(
          '.error, .alert, [class*="error"]'
        );
        const messages = [
          ...Array.from(alerts).map((e) => e.textContent?.trim()),
          ...Array.from(errorDivs).map((e) => e.textContent?.trim()),
        ].filter(Boolean);
        return messages.join("; ") || "no error message found";
      });
      log(`❌ 登录失败: ${errorMsg}`);
      throw new Error(`Login failed: ${errorMsg}. URL: ${page.url()}`);
    }

    log("✅ Khan Academy 登录成功");

    return {
      cookies: cookies.map((c) => ({ name: c.name, value: c.value })),
      logs,
    };
  } finally {
    await browser.close();
  }
}
