import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Collect console errors
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("http://localhost:3000/child-login");

  // Wait for hydration
  await page.waitForSelector("input[type='text']");
  const btnBefore = await page.$eval("button[type='submit']", (el) => ({
    disabled: (el as HTMLButtonElement).disabled,
    text: el.textContent,
  }));
  console.log("Button before typing:", JSON.stringify(btnBefore));

  // Type a name
  const input = page.locator("input[type='text']");
  await input.fill("Albert");
  await page.waitForTimeout(300);

  const btnAfter = await page.$eval("button[type='submit']", (el) => ({
    disabled: (el as HTMLButtonElement).disabled,
    text: el.textContent,
  }));
  console.log("Button after typing:", JSON.stringify(btnAfter));

  // Click submit (button should be enabled now)
  if (!btnAfter.disabled) {
    await page.click("button[type='submit']");
    await page.waitForTimeout(500);

    // Check if password screen appeared
    const passcodeVisible = await page.locator("input[type='password']").count();
    console.log(`Password inputs visible: ${passcodeVisible}`);

    // Screenshot for manual check
    const html = await page.content();
    const hasPasswordInput = html.includes('type="password"') || html.includes("PasscodeInput");
    console.log(`Has password inputs in DOM: ${hasPasswordInput}`);

    // Check for "你好" heading (name greeting)
    const bodyText = await page.textContent("body");
    console.log(`Body contains "你好": ${bodyText?.includes("你好")}`);
  }

  console.log("\n--- Console Errors ---");
  errors.forEach((e) => console.log(e));
  console.log("--- End Errors ---");

  await browser.close();
}

main().catch(console.error);
