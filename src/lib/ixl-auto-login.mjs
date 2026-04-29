import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

chromium.use(StealthPlugin());

const IXL_CREDENTIALS = {
  username: "albertcui868",
  password: "bank79",
};

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

async function humanType(page, selector, text) {
  for (const ch of text) {
    await page.type(selector, ch, { delay: rand(50, 150) });
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
  await el.click();
}

/**
 * Headless login to IXL, returns session payload with cookies.
 * Uses stealth plugin + humanized input to avoid detection.
 */
export async function autoLoginIxl() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
    ],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: rand(1280, 1440), height: rand(800, 900) },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });

    const page = await context.newPage();

    // Random delay before first request
    await page.waitForTimeout(rand(500, 2000));

    console.log("   🌐 正在加载 IXL 登录页...");
    await page.goto("https://www.ixl.com/signin", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    await page.waitForTimeout(rand(1000, 3000));

    const bodyText = await page.textContent("body");
    if (bodyText.includes("Checking your browser")) {
      throw new Error("Cloudflare blocked headless browser");
    }

    console.log("   ⌨️  输入账号...");
    await humanType(page, 'input[name="username"]', IXL_CREDENTIALS.username);
    await page.waitForTimeout(rand(300, 800));

    console.log("   ⌨️  输入密码...");
    await humanType(page, 'input[name="password"]', IXL_CREDENTIALS.password);
    await page.waitForTimeout(rand(500, 1500));

    console.log("   🖱️  点击登录...");
    await humanClick(page, 'button[type="submit"]');

    // Wait for login redirect
    await page.waitForTimeout(rand(3000, 5000));
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    const cookies = await context.cookies();
    const isLoggedIn = cookies.some(
      (c) => c.name === "is_logged_in" && c.value === "true"
    );

    if (!isLoggedIn) {
      throw new Error(`Login failed, current URL: ${page.url()}`);
    }

    console.log("   ✅ 登录成功");

    return {
      cookies: cookies.map((c) => ({ name: c.name, value: c.value })),
    };
  } finally {
    await browser.close();
  }
}
