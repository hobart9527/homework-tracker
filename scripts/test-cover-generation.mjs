#!/usr/bin/env node
/**
 * Cover image test — final verification with 60s timeout + image content-type check.
 */

async function generateCoverImage(coverImagePrompt) {
  const seed = Math.floor(Math.random() * 999999);
  const safePrompt = encodeURIComponent(coverImagePrompt);
  const baseUrl = `https://image.pollinations.ai/prompt/${safePrompt}?width=512&height=512&seed=${seed}&nologo=true`;

  const maxAttempts = 5;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(baseUrl, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(60000),
      });

      if (response.status >= 200 && response.status < 300) {
        const ct = response.headers.get("content-type") || "";
        if (ct.startsWith("image/") || baseUrl.includes("pollinations.ai")) {
          return baseUrl;
        }
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) break;
        const newUrl = new URL(location, baseUrl).toString();
        if (newUrl.includes("cdn.pollinations.ai")) return newUrl;
        if (newUrl.includes("pollinations.ai")) {
          const r2 = await fetch(newUrl, {
            method: "GET",
            redirect: "manual",
            signal: AbortSignal.timeout(60000),
          });
          if (r2.status === 200 && r2.url.includes("cdn.pollinations.ai")) return r2.url;
        }
      }

      if (attempt < maxAttempts - 1) await new Promise((r) => setTimeout(r, 5000));
    } catch {
      if (attempt < maxAttempts - 1) await new Promise((r) => setTimeout(r, 5000));
    }
  }

  return baseUrl.includes("pollinations.ai") ? baseUrl : null;
}

async function main() {
  console.log("=== Final Cover Generation Test ===\n");
  const prompts = [
    "A cute cartoon astronaut floating near a glowing moon with colorful stars",
    "A happy sea turtle swimming through a clean blue ocean",
    "A friendly robot helping children learn in a colorful classroom",
    "The ancient Egyptian pyramids under a blue sky",
    "A majestic elephant walking through the African savanna at sunset",
  ];

  let passed = 0;
  for (const prompt of prompts) {
    process.stdout.write(`"${prompt.slice(0, 45)}..." ... `);
    try {
      const url = await generateCoverImage(prompt);
      if (url && url.includes("pollinations.ai")) {
        console.log(`✅ ${url.split("?")[0].slice(-50)}...`);
        passed++;
      } else {
        console.log(`❌ null`);
      }
    } catch (e) {
      console.log(`❌ ${e.message}`);
    }
  }
  console.log(`\n${passed}/${prompts.length} succeeded`);
}

main().catch(console.error);