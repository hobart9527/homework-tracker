import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

chromium.use(StealthPlugin());

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

/** Get or create a persistent user data directory for a given account */
function getUserDataDir(username) {
  const baseDir = join(tmpdir(), "homework-tracker-playwright", "ixl");
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
 * Headless login to IXL, returns session payload with cookies.
 * Uses stealth plugin + humanized input + warm-up to avoid detection.
 *
 * @param {string} username
 * @param {string} password
 * @param {object} [options]
 * @param {function} [options.onProgress] - Callback for log messages
 * @returns {Promise<{cookies: Array<{name: string, value: string}>, logs: string[]}>}
 */
export async function autoLoginIxl(username, password, options = {}) {
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
    const existingCookies = await browser.cookies("https://www.ixl.com");
    const cookiesToClear = existingCookies.filter((c) =>
      ["is_logged_in", "PHPSESSID", "ixl_user", "ixlid", "userType", "sessionUserInfo", "JSESSIONID"].includes(c.name)
    );
    if (cookiesToClear.length > 0) {
      await browser.clearCookies(cookiesToClear.map((c) => ({ name: c.name, domain: c.domain, path: c.path })));
    }

    // Inject script to mask automation indicators on every new page
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
    log("🌐 访问 IXL 首页...");
    await page.goto("https://www.ixl.com", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    await page.waitForTimeout(rand(2000, 4000));
    await randomMouseWander(page);
    await humanScroll(page);
    await page.waitForTimeout(rand(1000, 2500));

    // Click sign-in link or navigate to login
    log("🔗 点击进入登录页...");
    const signInSelectors = [
      'a.site-nav-button-sign-in',
      'a[data-cy="site-nav-button-sign-in"]',
      'a.lk-sign-in',
      'header a:has-text("Sign in")',
    ];
    let clicked = false;
    for (const sel of signInSelectors) {
      const loc = page.locator(sel).first();
      try {
        await loc.waitFor({ timeout: 2000 });
        const box = await loc.boundingBox();
        if (box) {
          await page.mouse.move(
            box.x + rand(5, box.width - 5),
            box.y + rand(3, box.height - 3),
            { steps: rand(3, 8) }
          );
          await page.mouse.down();
          await page.waitForTimeout(rand(50, 150));
          await page.mouse.up();
        } else {
          await loc.click();
        }
        clicked = true;
        break;
      } catch {
        // try next selector
      }
    }
    if (!clicked) {
      await page.goto("https://www.ixl.com/signin", {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
    }

    // Wait for Cloudflare challenge to complete or page to stabilize
    log("⏳ 等待页面加载...");
    await page.waitForTimeout(rand(3000, 5000));

    let attempts = 0;
    while (attempts < 5) {
      const bodyText = await page.textContent("body").catch(() => "");
      const html = await page.content().catch(() => "");

      if (
        bodyText.includes("Checking your browser") ||
        bodyText.includes("cf-browser-verification")
      ) {
        log(
          "⏳ Cloudflare 正在检查浏览器，继续等待... (" +
            (attempts + 1) +
            "/5)"
        );
        await page.waitForTimeout(5000);
        attempts++;
        continue;
      }

      const hasUsernameInput =
        (await page.locator('input[name="username"], input#username').count()) > 0;
      if (hasUsernameInput) {
        break;
      }

      if (/turnstile|captcha|challenge-platform/i.test(html) && attempts >= 2) {
        log("🛑 检测到 CAPTCHA/验证码挑战");
        throw new Error("CAPTCHA challenge detected on IXL login page");
      }

      await page.waitForTimeout(3000);
      attempts++;
    }

    const hasUsernameInput =
      (await page.locator(
        'input[name="username"], input#username, input[type="text"]'
      ).count()) > 0;
    if (!hasUsernameInput) {
      const finalHtml = await page.content().catch(() => "");
      if (/turnstile|captcha|challenge-platform/i.test(finalHtml)) {
        log("🛑 页面被 CAPTCHA/Cloudflare 拦截");
        throw new Error("CAPTCHA challenge detected on IXL login page");
      }
      log("⚠️ 未找到登录表单，尝试继续...");
    }

    // Random mouse wander before filling form
    await randomMouseWander(page);
    await page.waitForTimeout(rand(300, 700));

    // Find and fill username field
    const usernameSelectors = [
      'input[name="username"]',
      'input#username',
      'input[type="text"]',
    ];
    let usernameFound = false;
    for (const sel of usernameSelectors) {
      if ((await page.locator(sel).count()) > 0) {
        log("⌨️  输入账号...");
        await humanType(page, sel, username);
        usernameFound = true;
        break;
      }
    }
    if (!usernameFound) {
      throw new Error("Could not find username input field on IXL login page");
    }

    await page.waitForTimeout(rand(400, 900));

    // Find and fill password field
    const passwordSelectors = [
      'input[name="password"]',
      'input#password',
      'input[type="password"]',
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
      throw new Error("Could not find password input field on IXL login page");
    }

    await page.waitForTimeout(rand(600, 1400));
    await randomMouseWander(page);

    // Find and click submit button
    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      '.sign-in-button',
      'button:has-text("Sign in")',
      'button:has-text("Log in")',
    ];
    let submitFound = false;
    for (const sel of submitSelectors) {
      if ((await page.locator(sel).count()) > 0) {
        log("🖱️  点击登录...");
        await humanClick(page, sel);
        submitFound = true;
        break;
      }
    }
    if (!submitFound) {
      throw new Error("Could not find submit button on IXL login page");
    }

    // Wait for login redirect with multiple checks
    log("⏳ 等待登录响应...");
    await page.waitForTimeout(rand(4000, 6000));
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    // Check for errors
    const currentUrl = page.url();
    const currentHtml = await page.content();

    if (currentUrl.includes("/signin") && currentHtml.includes("incorrect")) {
      log("❌ 账号或密码错误");
      throw new Error("Invalid IXL credentials");
    }

    // Gather cookies
    const cookies = await browser.cookies();
    const isLoggedIn = cookies.some(
      (c) => c.name === "is_logged_in" && c.value === "true"
    );
    const hasPhpSessId = cookies.some((c) => c.name === "PHPSESSID");
    const hasIxlUser = cookies.some((c) =>
      c.name.toLowerCase().includes("ixl_user")
    );

    log(`📥 Cookie: ${cookies.map((c) => c.name).join(", ") || "无"}`);

    if (!isLoggedIn && !hasPhpSessId && !hasIxlUser) {
      log("❌ 登录失败，未获取到有效 Session Cookie");
      throw new Error(
        `Login failed, current URL: ${currentUrl}, cookies: ${cookies
          .map((c) => c.name)
          .join(", ") || "none"}`
      );
    }

    log("✅ IXL 登录成功");

    return {
      cookies: cookies.map((c) => ({ name: c.name, value: c.value })),
      logs,
    };
  } finally {
    await browser.close();
  }
}
