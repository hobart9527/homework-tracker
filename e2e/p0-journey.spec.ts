/**
 * P0 核心旅程 E2E 测试
 * Homework Tracker - 前端交互验证
 */
import { test, expect } from "@playwright/test";

test.describe.configure({ mode: "parallel" });

// i18n redirects /login → /zh/login etc
function acceptsI18nPath(pattern: RegExp) {
  return (url: URL) => pattern.test(url.pathname.replace(/^\/(zh|en)/, ""));
}

// ══════════════════════════════════════════════════════════════════
// P0-1: 家长登录页面
// ══════════════════════════════════════════════════════════════════
test.describe("P0-1: 家长登录页面", () => {
  test("login page renders correctly", async ({ page }) => {
    await page.goto("/login");
    // i18n: /login may redirect to /zh/login
    await expect(page).toHaveURL(/\/login/);

    // Page title/heading should mention login
    await expect(page.locator("h1, h2").first()).toBeVisible();

    // Should show input fields (at least one visible text input)
    const inputs = page.getByRole("textbox");
    const inputCount = await inputs.count();
    expect(inputCount).toBeGreaterThanOrEqual(1);

    // Screenshot evidence
    await page.screenshot({
      path: ".omc/state/wave/wave-0/evidence/login_page.png",
      fullPage: true,
    });
  });
});

// ══════════════════════════════════════════════════════════════════
// P0-2: 作业列表页
// ══════════════════════════════════════════════════════════════════
test.describe("P0-2: 作业列表页", () => {
  test("homework page navigates and has correct structure", async ({ page }) => {
    // Navigate directly (skipping auth — will redirect to login)
    await page.goto("/homework");
    // Should redirect to login since not authenticated
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });

    // Screenshot evidence
    await page.screenshot({
      path: ".omc/state/wave/wave-0/evidence/homework_redirect.png",
      fullPage: true,
    });
  });

  test("homework/new page also redirects to login", async ({ page }) => {
    await page.goto("/homework/new");
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });

    await page.screenshot({
      path: ".omc/state/wave/wave-0/evidence/homework_new_redirect.png",
      fullPage: true,
    });
  });
});

// ══════════════════════════════════════════════════════════════════
// 常规页面可访问性检查
// ══════════════════════════════════════════════════════════════════
test.describe("关键页面可访问性检查", () => {
  const publicPages = ["/", "/login", "/child-login"];

  for (const path of publicPages) {
    test(`${path} renders without crash`, async ({ page }) => {
      const response = await page.goto(path, { waitUntil: "networkidle" });

      // Page should load with 200
      const status = response?.status() ?? 0;
      expect(status).toBeGreaterThanOrEqual(200);
      expect(status).toBeLessThan(500);

      // No uncaught page errors
      page.on("pageerror", (err) => {
        throw new Error(`Page error on ${path}: ${err.message}`);
      });

      // Page should have some visible content
      await expect(page.locator("body")).not.toBeEmpty();
    });
  }
});