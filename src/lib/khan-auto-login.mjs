import { chromium } from "playwright";

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

async function humanType(page, selector, text) {
  for (const ch of text) {
    await page.type(selector, ch, { delay: rand(50, 150) });
  }
}

/**
 * Headless login to Khan Academy.
 * Uses same Playwright config as the working sync-khan.mjs.
 */
export async function autoLoginKhan(username, password) {
  const browser = await chromium.launch({
    headless: false,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process",
    ],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });

    const page = await context.newPage();

    console.log("   🌐 正在加载 Khan Academy 登录页...");
    try {
      await page.goto("https://www.khanacademy.org/login", {
        waitUntil: "networkidle",
        timeout: 30000,
      });
    } catch (gotoErr) {
      await page.screenshot({ path: "/tmp/khan-goto-fail.png", fullPage: true });
      throw new Error(`Page load failed: ${gotoErr.message}`);
    }

    await page.waitForTimeout(rand(3000, 5000));

    const url = page.url();
    const title = await page.title().catch(() => "no-title");
    console.log(`   URL: ${url}`);
    console.log(`   Page title: ${title}`);

    if (!url || url === "about:blank") {
      throw new Error("Browser failed to navigate to Khan Academy");
    }

    // Check for Cloudflare block
    const bodyText = await page.textContent("body").catch(() => "");
    if (bodyText.includes("trouble loading external resources")) {
      await page.screenshot({ path: "/tmp/khan-debug.png", fullPage: true });
      throw new Error("Khan Academy login page blocked (Cloudflare), see /tmp/khan-debug.png");
    }

    // Step 1: Enter identifier and click Continue
    await page.waitForSelector('input[name="identifier"]', { timeout: 10000 });
    await humanType(page, 'input[name="identifier"]', username);
    console.log("   ⌨️  输入账号...");
    await page.waitForTimeout(rand(500, 1500));

    // Click "Continue" / "Next" button
    const continueBtn = page.locator('button[type="submit"]').first();
    if ((await continueBtn.count()) > 0) {
      await continueBtn.click();
      console.log("   🖱️  点击继续...");
    }

    // Step 2: Wait for password field to appear
    await page.waitForTimeout(rand(2000, 4000));
    await page.waitForSelector('input[name="password"]', { timeout: 10000 });
    await humanType(page, 'input[name="password"]', password);
    console.log("   ⌨️  输入密码...");
    await page.waitForTimeout(rand(500, 1500));

    // Step 3: Submit
    const submitBtn = page.locator('button[type="submit"]').first();
    if ((await submitBtn.count()) > 0) {
      await submitBtn.click();
      console.log("   🖱️  点击登录...");
    }

    // Wait for login redirect
    await page.waitForTimeout(rand(5000, 8000));
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    const cookies = await context.cookies();
    const hasKaaS = cookies.some((c) => c.name === "KAAS");

    if (!hasKaaS) {
      const url = page.url();
      const debugBody = (await page.textContent("body")).slice(0, 300);
      await page.screenshot({ path: "/tmp/khan-login-fail.png", fullPage: true });
      throw new Error(
        `Login failed. No KAAS cookie. URL: ${url} Body: ${debugBody}`
      );
    }

    console.log("   ✅ 登录成功");

    return {
      cookies: cookies.map((c) => ({ name: c.name, value: c.value })),
    };
  } finally {
    await browser.close();
  }
}
