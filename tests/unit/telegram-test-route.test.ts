import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

import { POST } from "@/app/api/channels/telegram/test/route";

function makeSupabaseClient(options?: {
  sessionUserId?: string | null;
  parent?: Record<string, unknown> | null;
}) {
  const sessionUserId =
    options && "sessionUserId" in options ? options.sessionUserId : "parent-1";
  const parent =
    options && "parent" in options
      ? options.parent
      : {
          telegram_chat_id: "123456789",
          telegram_recipient_label: "家长通知",
        };

  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: sessionUserId ? { user: { id: sessionUserId } } : null,
        },
      }),
    },
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          single: vi.fn().mockResolvedValue({
            data: parent,
            error: null,
          }),
        }),
      }),
    })),
  };
}

describe("telegram test route", () => {
  beforeEach(() => {
    createClientMock.mockReset();
    vi.restoreAllMocks();
    delete process.env.TELEGRAM_BOT_TOKEN;
  });

  it("rejects unauthenticated requests", async () => {
    createClientMock.mockResolvedValue(
      makeSupabaseClient({ sessionUserId: null })
    );

    const response = await POST();

    expect(response.status).toBe(401);
  });

  it("requires runtime bot token and chat id", async () => {
    createClientMock.mockResolvedValue(
      makeSupabaseClient({
        parent: {
          telegram_chat_id: "123456789",
          telegram_recipient_label: "家长通知",
        },
      })
    );

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: "缺少 Telegram Bot Token 或 Chat ID，无法发送测试消息。",
    });
  });

  it("sends a test message through the Telegram Bot API", async () => {
    createClientMock.mockResolvedValue(makeSupabaseClient());
    process.env.TELEGRAM_BOT_TOKEN = "123456:ABC-DEF";
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ ok: true }),
    } as any);

    const response = await POST();
    const body = await response.json();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.telegram.org/bot123456:ABC-DEF/sendMessage",
      expect.objectContaining({
        method: "POST",
      })
    );
    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      message: "Telegram 测试消息已发送。",
    });
  });
});
