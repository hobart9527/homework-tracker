export async function sendTelegramTextMessage(input: {
  botToken: string;
  chatId: string;
  text: string;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `https://api.telegram.org/bot${input.botToken}/sendMessage`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        chat_id: input.chatId,
        text: input.text,
      }),
    }
  );

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMessage =
      payload &&
      typeof payload === "object" &&
      "description" in payload &&
      typeof payload.description === "string"
        ? payload.description
        : "Telegram message send failed";

    throw new Error(errorMessage);
  }

  return payload;
}

