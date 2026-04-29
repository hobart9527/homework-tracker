const WECOM_API_BASE = "https://qyapi.weixin.qq.com/cgi-bin";

let tokenCache: { token: string; expiresAt: number } | null = null;

export async function getWeComAccessToken(
  corpid: string,
  corpsecret: string
): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  const url = `${WECOM_API_BASE}/gettoken?corpid=${encodeURIComponent(corpid)}&corpsecret=${encodeURIComponent(corpsecret)}`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.errcode !== 0) {
    throw new Error(
      `WeCom gettoken failed: ${data.errmsg} (errcode=${data.errcode})`
    );
  }

  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 300) * 1000,
  };

  return tokenCache.token;
}

export async function uploadMediaToWeCom(
  accessToken: string,
  buffer: Buffer,
  filename: string,
  type: "file" | "voice" = "file"
): Promise<string> {
  const boundary = `----WeCom${Date.now()}`;
  const header = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="media"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([header, buffer, footer]);

  const url = `${WECOM_API_BASE}/media/upload?access_token=${accessToken}&type=${type}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });

  const data = await res.json();

  if (data.errcode !== 0) {
    throw new Error(
      `WeCom media upload failed: ${data.errmsg} (errcode=${data.errcode})`
    );
  }

  return data.media_id;
}

export async function sendFileToWeComChat(
  accessToken: string,
  chatid: string,
  mediaId: string
): Promise<string | null> {
  const url = `${WECOM_API_BASE}/appchat/send?access_token=${accessToken}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chatid,
      msgtype: "file",
      file: { media_id: mediaId },
    }),
  });

  const data = await res.json();

  if (data.errcode !== 0) {
    throw new Error(
      `WeCom appchat/send failed: ${data.errmsg} (errcode=${data.errcode})`
    );
  }

  return data.msgid ?? null;
}
