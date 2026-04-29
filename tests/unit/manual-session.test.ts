import { describe, expect, it, vi } from "vitest";
import { PATCH } from "@/app/api/platform-connections/[id]/manual-session/route";

const createClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

function makeSupabaseClient(options?: {
  sessionUserId?: string | null;
  childParentId?: string;
  updateError?: { message: string } | null;
}) {
  const sessionUserId =
    options && "sessionUserId" in options ? options.sessionUserId : "parent-1";
  const childParentId = options?.childParentId ?? "parent-1";
  const updateMock = vi.fn(() => ({
    eq: vi.fn().mockResolvedValue({ error: options?.updateError ?? null }),
  }));

  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: sessionUserId ? { user: { id: sessionUserId } } : null,
        },
      }),
    },
    from: vi.fn((table: string) => {
      if (table === "platform_accounts") {
        return {
          update: updateMock,
        };
      }
      return {};
    }),
    _mocks: {
      updateMock,
    },
  };
}

function makeAccountSelectResult(
  childParentId: string,
  accountId: string
) {
  return {
    data: {
      id: accountId,
      child_id: "child-1",
      platform: "ixl",
      external_account_ref: "family-account",
      auth_mode: "auto_login",
      status: "attention_required",
      managed_session_payload: null,
      managed_session_captured_at: null,
      managed_session_expires_at: null,
      last_sync_error_summary: "CAPTCHA required",
      login_credentials_encrypted: "encrypted-data",
      auto_login_enabled: true,
      created_at: "2026-04-20T10:00:00.000Z",
      children: {
        parent_id: childParentId,
      },
    },
    error: null,
  };
}

describe("PATCH /api/platform-connections/[id]/manual-session", () => {
  beforeEach(() => {
    createClientMock.mockReset();
  });

  it("rejects unauthenticated requests", async () => {
    createClientMock.mockResolvedValue(
      makeSupabaseClient({ sessionUserId: null })
    );

    const response = await PATCH(
      new Request("http://localhost/api/platform-connections/acc-1/manual-session", {
        method: "PATCH",
        body: JSON.stringify({
          managedSessionPayload: { cookies: [{ name: "x", value: "y" }] },
        }),
      }),
      { params: { id: "acc-1" } }
    );

    expect(response.status).toBe(401);
  });

  it("updates managed session payload and resets status to active", async () => {
    const client = makeSupabaseClient();
    createClientMock.mockResolvedValue(client);

    // We need to intercept the select call for platform_accounts
    const fromFn = client.from as ReturnType<typeof vi.fn>;
    fromFn.mockImplementation((table: string) => {
      if (table === "platform_accounts") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((_column: string, accountId: string) => ({
              single: vi.fn().mockResolvedValue(
                makeAccountSelectResult("parent-1", accountId)
              ),
            })),
          })),
          update: client._mocks.updateMock,
        };
      }
      return {};
    });

    const response = await PATCH(
      new Request(
        "http://localhost/api/platform-connections/acc-1/manual-session",
        {
          method: "PATCH",
          body: JSON.stringify({
            managedSessionPayload: {
              cookies: [{ name: "PHPSESSID", value: "session-abc" }],
            },
          }),
        }
      ),
      { params: { id: "acc-1" } }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(client._mocks.updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        managed_session_payload: {
          cookies: [{ name: "PHPSESSID", value: "session-abc" }],
        },
        status: "active",
        last_sync_error_summary: null,
      })
    );
  });

  it("blocks cross-parent access", async () => {
    const client = makeSupabaseClient({ childParentId: "parent-2" });
    createClientMock.mockResolvedValue(client);

    const fromFn = client.from as ReturnType<typeof vi.fn>;
    fromFn.mockImplementation((table: string) => {
      if (table === "platform_accounts") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((_column: string, accountId: string) => ({
              single: vi.fn().mockResolvedValue(
                makeAccountSelectResult("parent-2", accountId)
              ),
            })),
          })),
          update: client._mocks.updateMock,
        };
      }
      return {};
    });

    const response = await PATCH(
      new Request(
        "http://localhost/api/platform-connections/acc-1/manual-session",
        {
          method: "PATCH",
          body: JSON.stringify({
            managedSessionPayload: { cookies: [{ name: "x", value: "y" }] },
          }),
        }
      ),
      { params: { id: "acc-1" } }
    );

    expect(response.status).toBe(403);
  });

  it("rejects requests with empty payload", async () => {
    const client = makeSupabaseClient();
    createClientMock.mockResolvedValue(client);

    const fromFn = client.from as ReturnType<typeof vi.fn>;
    fromFn.mockImplementation((table: string) => {
      if (table === "platform_accounts") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((_column: string, accountId: string) => ({
              single: vi.fn().mockResolvedValue(
                makeAccountSelectResult("parent-1", accountId)
              ),
            })),
          })),
          update: client._mocks.updateMock,
        };
      }
      return {};
    });

    const response = await PATCH(
      new Request(
        "http://localhost/api/platform-connections/acc-1/manual-session",
        {
          method: "PATCH",
          body: JSON.stringify({}),
        }
      ),
      { params: { id: "acc-1" } }
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("缺少");
  });
});
