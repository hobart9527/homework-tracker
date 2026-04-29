#!/usr/bin/env node

import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * 本地 Session 收集脚本
 *
 * 启动真实 Chromium 浏览器，让用户手动完成登录（包括 CAPTCHA），
 * 登录成功后自动提取所有 Cookie 并格式化为应用所需的 JSON。
 *
 * 用法：
 *   完全手动（推荐首次使用）：
 *     npm run session:collect -- --platform=ixl
 *
 *   半自动（提供凭据，脚本自动填充，用户只处理 CAPTCHA）：
 *     npm run session:collect -- --platform=ixl --username=xxx --password=xxx
 */

const PLATFORM_CONFIG = {
  ixl: {
    name: "IXL",
    loginUrl: "https://www.ixl.com/signin",
    autoFill: {
      usernameSelector:
        'input#username, input[name="username"], input[type="text"]',
      passwordSelector:
        'input#password, input[name="password"], input[type="password"]',
      submitSelector:
        'button[type="submit"], input[type="submit"], .sign-in-button',
    },
    cookieNames: ["PHPSESSID", "ixlid", "ixl_user"],
  },
  "khan-academy": {
    name: "Khan Academy",
    loginUrl: "https://www.khanacademy.org/login",
    autoFill: {
      usernameSelector:
        'input[name="identifier"], input[type="email"], input#identifier',
      passwordSelector:
        'input[name="password"], input[type="password"]',
      submitSelector: 'button[type="submit"], ._1o0an4p',
    },
    cookieNames: ["KAAS", "fkey", "ka_session"],
  },
  epic: {
    name: "Epic",
    loginUrl: "https://www.getepic.com/sign-in/parent",
    autoFill: {
      usernameSelector:
        'input[type="email"], input[name="email"], input[name="username"]',
      passwordSelector:
        'input[type="password"], input[name="password"]',
      submitSelector:
        'button[type="submit"], button:has-text("Log In"), input[type="submit"]',
    },
    cookieNames: ["epic", "_epic", "connect.sid", "session"],
    requiresActivityUrl: true,
  },
  "raz-kids": {
    name: "Raz-Kids",
    loginUrl: "https://www.raz-kids.com/",
    autoFill: null,
    cookieNames: ["raz", "kidsa-z", "JSESSIONID", "session"],
    requiresActivityUrl: true,
  },
};

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

async function copyToClipboard(text) {
  try {
    const { exec } = await import("child_process");
    const platform = process.platform;

    if (platform === "darwin") {
      const proc = exec("pbcopy");
      proc.stdin.write(text);
      proc.stdin.end();
      return true;
    }

    if (platform === "win32") {
      const proc = exec("clip");
      proc.stdin.write(text);
      proc.stdin.end();
      return true;
    }

    // Linux: try xclip then wl-copy
    try {
      const proc = exec("xclip -selection clipboard");
      proc.stdin.write(text);
      proc.stdin.end();
      return true;
    } catch {
      const proc = exec("wl-copy");
      proc.stdin.write(text);
      proc.stdin.end();
      return true;
    }
  } catch {
    return false;
  }
}

async function waitForEnter() {
  const readline = await import("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(
      "\n\x1b[36m⏎ 登录完成后请按 Enter 提取 Cookie...\x1b[0m",
      () => {
        rl.close();
        resolve();
      }
    );
  });
}

async function main() {
  const args = parseArgs();
  const platform = args.platform || "ixl";
  const username = args.username;
  const password = args.password;

  const config = PLATFORM_CONFIG[platform];
  if (!config) {
    console.error(`❌ Unsupported platform: ${platform}`);
    console.error(
      `Supported: ${Object.keys(PLATFORM_CONFIG).join(", ")}`
    );
    process.exit(1);
  }

  console.log(`\n🔧 ${config.name} Session Collector`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // Check Playwright availability
  let chromium;
  try {
    const playwright = await import("playwright");
    chromium = playwright.chromium;
  } catch {
    console.error("\n❌ Playwright not found.");
    console.error("Please install it first:");
    console.error("   npm install playwright");
    console.error("   npx playwright install chromium");
    process.exit(1);
  }

  console.log("\n🚀 Launching browser...");

  const browser = await chromium.launch({
    headless: false,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process",
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();

  console.log(`🌐 Navigating to ${config.loginUrl}...`);
  await page.goto(config.loginUrl, { waitUntil: "networkidle" });

  // Auto-fill credentials when provided
  if (username && password && config.autoFill) {
    console.log("\n📝 Auto-filling credentials...");
    try {
      const uSelectors = config.autoFill.usernameSelector.split(", ");
      const pSelectors = config.autoFill.passwordSelector.split(", ");
      const sSelectors = config.autoFill.submitSelector.split(", ");

      let filled = false;
      for (const sel of uSelectors) {
        if ((await page.locator(sel).count()) > 0) {
          await page.fill(sel, username);
          filled = true;
          break;
        }
      }

      if (filled) {
        for (const sel of pSelectors) {
          if ((await page.locator(sel).count()) > 0) {
            await page.fill(sel, password);
            break;
          }
        }
        for (const sel of sSelectors) {
          if ((await page.locator(sel).count()) > 0) {
            await page.click(sel);
            console.log("✅ Submitted login form");
            break;
          }
        }
      } else {
        console.log(
          "⚠️  Could not find username field. Please fill manually."
        );
      }
    } catch {
      console.log(
        "⚠️  Auto-fill failed. Please fill manually."
      );
    }
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📝  Steps:");
  console.log("   1. Complete login in the browser window");
  console.log("   2. Solve any CAPTCHA manually if it appears");
  if (config.requiresActivityUrl) {
    console.log("   3. After login, open the learning activity/progress page");
    console.log("   4. Wait until that activity page fully loads");
  } else {
    console.log("   3. Wait until the logged-in dashboard loads");
  }
  console.log("   5. Return here and press ENTER");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  await waitForEnter();

  console.log("\n🔍 Collecting session cookies...");

  const cookies = await context.cookies();

  const sessionCookies = cookies.filter((c) =>
    config.cookieNames.some((name) =>
      c.name.toLowerCase().includes(name.toLowerCase())
    )
  );

  if (sessionCookies.length === 0) {
    console.log(
      "\n⚠️  Warning: no recognized session cookies found."
    );
    console.log(
      "Available cookies:",
      cookies.map((c) => c.name).join(", ")
    );
  } else {
    console.log(
      `✅ Found ${sessionCookies.length} session cookie(s): ${sessionCookies
        .map((c) => c.name)
        .join(", ")}`
    );
  }

  const payload = {
    ...(config.requiresActivityUrl
      ? {
          activityUrl: page.url(),
        }
      : {}),
    cookies: cookies.map((c) => ({
      name: c.name,
      value: c.value,
    })),
  };

  const json = JSON.stringify(payload, null, 2);

  console.log("\n📋 Session JSON:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(json);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  if (config.requiresActivityUrl) {
    console.log(`\n🔗 Captured activity URL: ${page.url()}`);
  }

  const copied = await copyToClipboard(json);
  if (copied) {
    console.log("\n✅ Copied to clipboard! Paste it into the app.");
  } else {
    console.log(
      "\n⚠️  Could not copy to clipboard. Please copy the JSON above manually."
    );
  }

  await browser.close();
  console.log("\n👋 Done!\n");
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
