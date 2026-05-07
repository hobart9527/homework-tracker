// @ts-check
import { createClient } from "@supabase/supabase-js";
import { createHash, createDecipheriv } from "crypto";
import { autoLoginIxl } from "../src/lib/ixl-auto-login.mjs";
import { autoLoginKhan } from "../src/lib/khan-auto-login.mjs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENCRYPTION_KEY = process.env.PLATFORM_CREDENTIALS_ENCRYPTION_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ENCRYPTION_KEY) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const PLATFORM_LOGIN_FN = {
  ixl: autoLoginIxl,
  "khan-academy": autoLoginKhan,
};

function deriveKey(secret) {
  return createHash("sha256").update(secret).digest();
}

function decryptCredential(encryptedData, secretKey) {
  const parts = encryptedData.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted data format");
  }
  const [ivHex, authTagHex, encrypted] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const key = deriveKey(secretKey);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: accounts, error } = await supabase
  .from("platform_accounts")
  .select("*")
  .in("platform", ["ixl", "khan-academy"])
  .not("login_credentials_encrypted", "is", null)
  .eq("status", "active");

if (error) {
  console.error("Failed to fetch platform accounts:", error.message);
  process.exit(1);
}

if (!accounts || accounts.length === 0) {
  console.log("No active platform accounts with stored credentials. Nothing to refresh.");
  process.exit(0);
}

console.log(`Found ${accounts.length} platform account(s) to refresh\n`);

let successCount = 0;
let failureCount = 0;

for (const account of accounts) {
  const platform = account.platform;
  const loginFn = PLATFORM_LOGIN_FN[platform];

  if (!loginFn) {
    console.log(`[${account.id}] Skipping unsupported platform: ${platform}`);
    continue;
  }

  console.log(`[${account.id}] Refreshing ${platform} session for ${account.external_account_ref || "unknown"}...`);

  try {
    // Decrypt stored credentials
    const credsJson = decryptCredential(account.login_credentials_encrypted, ENCRYPTION_KEY);
    const creds = JSON.parse(credsJson);
    const username = creds.username || creds.email;
    const password = creds.password;

    if (!username || !password) {
      console.error(`[${account.id}] No username/password in decrypted credentials`);
      failureCount++;
      continue;
    }

    // Run browser login
    const result = await loginFn(username, password, { headless: true });

    if (!result || !result.cookies || result.cookies.length === 0) {
      console.error(`[${account.id}] Login returned no cookies`);
      failureCount++;
      continue;
    }

    // Store cookies back to Supabase
    const { error: updateError } = await supabase
      .from("platform_accounts")
      .update({
        managed_session_payload: {
          cookies: result.cookies,
          updated_at: new Date().toISOString(),
          updated_by: "github-actions-refresh",
        },
      })
      .eq("id", account.id);

    if (updateError) {
      console.error(`[${account.id}] Failed to save cookies: ${updateError.message}`);
      failureCount++;
    } else {
      console.log(`[${account.id}] Session refreshed (${result.cookies.length} cookies)`);
      successCount++;
    }

    if (result.logs && result.logs.length > 0) {
      for (const log of result.logs) {
        console.log(`  ${log}`);
      }
    }
  } catch (err) {
    console.error(`[${account.id}] Error: ${err.message}`);
    failureCount++;
  }

  console.log("");
}

console.log(`Done. Success: ${successCount}, Failed: ${failureCount}`);
process.exit(failureCount > 0 ? 1 : 0);
