#!/usr/bin/env node

/**
 * Voice Push Bridge — iLink Bot Edition
 *
 * A real WeChat bridge that uses the official iLink Bot protocol to send
 * voice/audio files into WeChat groups.
 *
 * Protocol: https://ilinkai.weixin.qq.com
 * SDK: @pawastation/ilink-bot-sdk
 *
 * Endpoints (same contract as voice-push-bridge-example.mjs):
 *   POST /send  — accept a queued audio delivery
 *   GET  /health — inspect bridge health and delivered count
 *
 * Environment:
 *   ILINK_API_BASE_URL    — iLink API endpoint (default: https://ilinkai.weixin.qq.com)
 *   ILINK_CDN_BASE_URL    — iLink CDN endpoint (default: https://novac2c.cdn.weixin.qq.com/c2c)
 *   VOICE_PUSH_BRIDGE_TOKEN — Bearer token for bridge auth (optional)
 *   BRIDGE_PORT           — HTTP port (default: 4010)
 *   BRIDGE_HOST           — HTTP host (default: 127.0.0.1)
 *   CREDENTIALS_PATH      — Where to save iLink credentials (default: ~/.voice-push-bridge/credentials.json)
 */

import http from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

import {
  loginWithQR,
  runPoller,
  sendMediaData,
  setContextToken,
  getContextToken,
  memorySyncStorage,
} from "@pawastation/ilink-bot-sdk";

// ─── Config ──────────────────────────────────────────────────────────

const API_BASE_URL = process.env.ILINK_API_BASE_URL || "https://ilinkai.weixin.qq.com";
const CDN_BASE_URL = process.env.ILINK_CDN_BASE_URL || "https://novac2c.cdn.weixin.qq.com/c2c";
const BRIDGE_TOKEN = process.env.VOICE_PUSH_BRIDGE_TOKEN || "";
const PORT = Number(process.env.BRIDGE_PORT || "4010");
const HOST = process.env.BRIDGE_HOST || "127.0.0.1";
const CREDENTIALS_PATH = process.env.CREDENTIALS_PATH || join(homedir(), ".voice-push-bridge", "credentials.json");

// In-memory state
const deliveredKeys = new Map(); // deliveryKey -> remoteMessageId
const groupRegistry = new Map(); // recipientRef -> { userId, contextToken, label, lastSeenAt }
let apiOpts = null; // { baseUrl, token }
let accountId = null;
let pollerAbortController = null;

// ─── Credentials persistence ─────────────────────────────────────────

function loadCredentials() {
  try {
    if (!existsSync(CREDENTIALS_PATH)) return null;
    const raw = readFileSync(CREDENTIALS_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveCredentials(creds) {
  mkdirSync(dirname(CREDENTIALS_PATH), { recursive: true });
  writeFileSync(CREDENTIALS_PATH, JSON.stringify(creds, null, 2));
}

// ─── Logging ─────────────────────────────────────────────────────────

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(" ")}`;
  console.log(line);
}

// ─── iLink Bot login ─────────────────────────────────────────────────

async function ensureLoggedIn() {
  const cached = loadCredentials();

  if (cached?.botToken && cached?.accountId && cached?.baseUrl) {
    apiOpts = { baseUrl: cached.baseUrl, token: cached.botToken };
    accountId = cached.accountId;
    log(`Loaded cached credentials for account ${accountId}`);
    return;
  }

  log("No cached credentials. Starting QR login...");
  log("Please scan the QR code with WeChat to authorize this bot.");

  const result = await loginWithQR({
    apiBaseUrl: API_BASE_URL,
    callbacks: {
      onQRCode: (url) => {
        log(`QR Code URL: ${url}`);
        log("(Open this URL on your phone or computer to display the QR code for scanning)");
      },
      onStatus: (status) => {
        log(`Login status: ${status}`);
      },
    },
  });

  if (!result.connected || !result.botToken) {
    throw new Error(`Login failed: ${result.message}`);
  }

  apiOpts = { baseUrl: result.baseUrl || API_BASE_URL, token: result.botToken };
  accountId = result.accountId;

  saveCredentials({
    botToken: result.botToken,
    accountId: result.accountId,
    baseUrl: result.baseUrl || API_BASE_URL,
    userId: result.userId,
    savedAt: new Date().toISOString(),
  });

  log(`Login successful. Account: ${accountId}, User: ${result.userId}`);
}

// ─── Message polling ─────────────────────────────────────────────────

async function startPoller() {
  if (!apiOpts || !accountId) {
    throw new Error("Not logged in");
  }

  pollerAbortController = new AbortController();

  log("Starting iLink message poller...");

  runPoller({
    apiOpts,
    accountId,
    syncStorage: memorySyncStorage(),
    signal: pollerAbortController.signal,
    onMessage: (msg) => {
      const fromUserId = msg.from_user_id;
      const groupId = msg.group_id;
      const contextToken = msg.context_token;

      // Use group_id for group messages, from_user_id for direct messages
      const recipientRef = groupId || fromUserId;

      if (!recipientRef) {
        log("[poller] Message without identifiable sender, skipping");
        return;
      }

      // Extract text body for logging
      let textPreview = "";
      if (msg.item_list) {
        for (const item of msg.item_list) {
          if (item.text_item?.text) {
            textPreview = item.text_item.text.slice(0, 50);
            break;
          }
        }
      }

      if (contextToken) {
        // Cache context token for this recipient
        const existing = groupRegistry.get(recipientRef);
        groupRegistry.set(recipientRef, {
          userId: fromUserId,
          groupId: groupId || null,
          contextToken,
          label: existing?.label || null,
          lastSeenAt: Date.now(),
        });

        if (!existing) {
          log(`[poller] Discovered new recipient: recipientRef=${recipientRef} groupId=${groupId || "(DM)"} text="${textPreview}"`);
          log(`[poller] ^ You can now use recipient_ref="${recipientRef}" in message routing rules`);
        } else {
          log(`[poller] Refreshed context token for recipient=${recipientRef} text="${textPreview}"`);
        }
      } else {
        log(`[poller] Message from ${recipientRef} has no context_token (cannot send proactively)`);
      }
    },
    onPoll: () => {
      // Optional: log every poll cycle
    },
    logger: {
      debug: (...args) => {},
      info: (...args) => log("[ilink]", ...args),
      warn: (...args) => log("[ilink WARN]", ...args),
      error: (...args) => log("[ilink ERR]", ...args),
    },
  }).catch((err) => {
    log("[poller] Poller exited:", err.message);
  });
}

// ─── HTTP helpers ────────────────────────────────────────────────────

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function downloadFile(url) {
  const response = await fetch(url, { method: "GET" });
  if (!response.ok) {
    throw new Error(`Download failed: HTTP ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ─── Send voice file via iLink ───────────────────────────────────────

async function sendVoiceFile(input) {
  const { recipientRef, fileUrl, filePath, childName, homeworkTitle } = input;

  const registry = groupRegistry.get(recipientRef);
  if (!registry) {
    throw new Error(
      `No active context_token for recipientRef="${recipientRef}". ` +
      `Please ensure someone has sent a message in this group after the bridge started. ` +
      `Known recipients: ${Array.from(groupRegistry.keys()).join(", ") || "(none)"}`
    );
  }

  const { contextToken, userId } = registry;
  if (!contextToken) {
    throw new Error(`Recipient ${recipientRef} has no valid context_token`);
  }

  // Download the audio file
  const downloadUrl = fileUrl || filePath;
  if (!downloadUrl || (!downloadUrl.startsWith("http://") && !downloadUrl.startsWith("https://"))) {
    throw new Error(
      `Invalid file URL: ${downloadUrl}. ` +
      `The bridge requires a downloadable URL (fileUrl or filePath must be a full HTTP URL).`
    );
  }

  log(`[send] Downloading audio from ${downloadUrl}...`);
  const fileData = await downloadFile(downloadUrl);

  // Determine filename from URL or use default
  let filename = "voice.m4a";
  try {
    const urlObj = new URL(downloadUrl);
    const pathname = urlObj.pathname;
    const basename = pathname.split("/").pop();
    if (basename) filename = basename;
  } catch {}

  const caption = childName && homeworkTitle
    ? `${childName} 的作业录音：${homeworkTitle}`
    : "作业录音";

  log(`[send] Uploading and sending ${filename} (${fileData.length} bytes) to ${recipientRef}...`);

  const result = await sendMediaData({
    data: fileData,
    filename,
    to: userId,
    text: caption,
    apiOpts,
    contextToken,
    cdnBaseUrl: CDN_BASE_URL,
    logger: {
      debug: () => {},
      info: (...args) => log("[sendMediaData]", ...args),
      warn: (...args) => log("[sendMediaData WARN]", ...args),
      error: (...args) => log("[sendMediaData ERR]", ...args),
    },
  });

  log(`[send] Sent successfully. messageId=${result.messageId}`);
  return result.messageId;
}

// ─── HTTP Server ─────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization, x-delivery-key");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (req.method === "GET" && req.url === "/health") {
    const healthy = apiOpts !== null && accountId !== null;
    return sendJson(res, healthy ? 200 : 503, {
      ok: healthy,
      connected: healthy,
      accountId: accountId || null,
      deliveredCount: deliveredKeys.size,
      knownGroups: groupRegistry.size,
      knownGroupIds: Array.from(groupRegistry.keys()),
    });
  }

  // List known groups (for discovery)
  if (req.method === "GET" && req.url === "/groups") {
    const groups = Array.from(groupRegistry.entries()).map(([ref, info]) => ({
      recipientRef: ref,
      groupId: info.groupId,
      label: info.label,
      lastSeenAt: info.lastSeenAt,
      hasToken: !!info.contextToken,
    }));
    return sendJson(res, 200, { groups });
  }

  // Send endpoint
  if (req.method !== "POST" || req.url !== "/send") {
    return sendJson(res, 404, { error: "Not found" });
  }

  // Auth
  if (BRIDGE_TOKEN) {
    const auth = req.headers.authorization || "";
    if (auth !== `Bearer ${BRIDGE_TOKEN}`) {
      return sendJson(res, 401, { error: "Unauthorized bridge token" });
    }
  }

  // Delivery key (idempotency)
  const deliveryKey = req.headers["x-delivery-key"];
  if (typeof deliveryKey !== "string" || !deliveryKey) {
    return sendJson(res, 400, { error: "Missing x-delivery-key header" });
  }

  // Parse body
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body" });
  }

  const {
    taskId,
    attachmentId,
    filePath,
    fileUrl,
    channel,
    recipientRef,
    recipientLabel,
    attemptNumber,
    childId,
    homeworkId,
  } = body ?? {};

  if (!taskId || !attachmentId || !attemptNumber || !recipientRef) {
    return sendJson(res, 400, {
      error: "Missing required delivery fields (taskId, attachmentId, attemptNumber, recipientRef)",
    });
  }

  // Duplicate check
  if (deliveredKeys.has(deliveryKey)) {
    return sendJson(res, 409, {
      remoteMessageId: deliveredKeys.get(deliveryKey),
    });
  }

  // Only wechat_group channel is supported by this bridge
  if (channel && channel !== "wechat_group") {
    return sendJson(res, 400, {
      error: `Channel "${channel}" is not supported by this bridge. Only "wechat_group" is supported.`,
    });
  }

  // Check login state
  if (!apiOpts || !accountId) {
    return sendJson(res, 503, {
      error: "Bridge not connected to iLink. Please wait for login to complete.",
    });
  }

  try {
    const remoteMessageId = await sendVoiceFile({
      recipientRef,
      fileUrl,
      filePath,
      childName: body.childName,
      homeworkTitle: body.homeworkTitle,
    });

    deliveredKeys.set(deliveryKey, remoteMessageId);

    log(`[bridge] accepted task=${taskId} attachment=${attachmentId} attempt=${attemptNumber} recipient=${recipientRef} msg=${remoteMessageId}`);

    return sendJson(res, 200, { remoteMessageId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`[bridge] FAILED task=${taskId} error="${message}"`);
    return sendJson(res, 502, { error: message });
  }
});

// ─── Graceful shutdown ───────────────────────────────────────────────

function shutdown() {
  log("Shutting down...");
  if (pollerAbortController) {
    pollerAbortController.abort();
  }
  server.close(() => {
    log("Server closed.");
    process.exit(0);
  });
  // Force exit after 5s
  setTimeout(() => {
    log("Forced exit.");
    process.exit(1);
  }, 5000);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  log("=".repeat(60));
  log("Voice Push Bridge — iLink Bot Edition");
  log(`API Base: ${API_BASE_URL}`);
  log(`CDN Base: ${CDN_BASE_URL}`);
  log(`Credentials: ${CREDENTIALS_PATH}`);
  log("=".repeat(60));

  await ensureLoggedIn();

  // Start poller in background (non-blocking)
  startPoller().catch((err) => {
    log("[main] Poller failed to start:", err.message);
  });

  // Start HTTP server
  server.listen(PORT, HOST, () => {
    log(`[bridge] HTTP server listening on http://${HOST}:${PORT}`);
    log("[bridge] POST /send  — send a voice file to WeChat");
    log("[bridge] GET  /health — check bridge health");
    log("[bridge] GET  /groups — list known WeChat groups");
    log("[bridge] Send a message in your target group to activate the bridge.");
  });
}

main().catch((err) => {
  log("[fatal]", err.message);
  process.exit(1);
});
