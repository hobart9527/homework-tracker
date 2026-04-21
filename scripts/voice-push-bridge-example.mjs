import http from "node:http";

const port = Number(process.env.BRIDGE_PORT || "4010");
const host = process.env.BRIDGE_HOST || "127.0.0.1";
const expectedToken = process.env.VOICE_PUSH_BRIDGE_TOKEN || "";
const deliveredKeys = new Map();

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";

    req.on("data", (chunk) => {
      raw += chunk;
    });

    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });

    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    return sendJson(res, 200, {
      ok: true,
      deliveredCount: deliveredKeys.size,
    });
  }

  if (req.method !== "POST" || req.url !== "/send") {
    return sendJson(res, 404, {
      error: "Not found",
    });
  }

  if (expectedToken) {
    const authorization = req.headers.authorization || "";

    if (authorization !== `Bearer ${expectedToken}`) {
      return sendJson(res, 401, {
        error: "Unauthorized bridge token",
      });
    }
  }

  const deliveryKey = req.headers["x-delivery-key"];

  if (typeof deliveryKey !== "string" || !deliveryKey) {
    return sendJson(res, 400, {
      error: "Missing x-delivery-key header",
    });
  }

  let body;

  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, {
      error: "Invalid JSON body",
    });
  }

  const { taskId, attachmentId, filePath, attemptNumber } = body ?? {};

  if (!taskId || !attachmentId || !filePath || !attemptNumber) {
    return sendJson(res, 400, {
      error: "Missing required delivery fields",
    });
  }

  if (deliveredKeys.has(deliveryKey)) {
    return sendJson(res, 409, {
      remoteMessageId: deliveredKeys.get(deliveryKey),
    });
  }

  const remoteMessageId = `bridge-msg-${taskId}`;
  deliveredKeys.set(deliveryKey, remoteMessageId);

  console.log(
    `[voice-bridge] accepted task=${taskId} attachment=${attachmentId} attempt=${attemptNumber} file=${filePath}`
  );

  return sendJson(res, 200, {
    remoteMessageId,
  });
});

server.listen(port, host, () => {
  console.log(`[voice-bridge] listening on http://${host}:${port}`);
  console.log("[voice-bridge] POST /send to accept a queued audio delivery");
  console.log("[voice-bridge] GET /health to inspect delivered key count");
});
