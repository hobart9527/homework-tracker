import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const PLATFORM_CREDENTIALS_NAMESPACE = "::platform-credentials";

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

/**
 * Derive platform-credentials encryption key from SUPABASE_SERVICE_ROLE_KEY.
 * Replaces the previous PLATFORM_CREDENTIALS_ENCRYPTION_KEY env var.
 * Namespace salt prevents cross-use if the service role key is used for other encryption.
 */
export function getPlatformCredentialsKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }
  return key + PLATFORM_CREDENTIALS_NAMESPACE;
}

export function encryptCredential(plainText: string, secretKey: string): string {
  const key = deriveKey(secretKey);
  if (key.length !== KEY_LENGTH) {
    throw new Error("Invalid key length for AES-256");
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

export function decryptCredential(encryptedData: string, secretKey: string): string {
  const parts = encryptedData.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted data format");
  }

  const [ivHex, authTagHex, encrypted] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const key = deriveKey(secretKey);

  if (key.length !== KEY_LENGTH) {
    throw new Error("Invalid key length for AES-256");
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
