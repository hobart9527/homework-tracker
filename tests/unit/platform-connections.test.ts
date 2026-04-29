import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/platform-connections/route";

const createClientMock = vi.hoisted(() => vi.fn());
const simulateIxlLoginMock = vi.hoisted(() => vi.fn());
const simulateKhanLoginMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/platform-adapters/ixl-auth", () => ({
  simulateIxlLogin: simulateIxlLoginMock,
}));

vi.mock("@/lib/platform-adapters/khan-auth", () => ({
  simulateKhanLogin: simulateKhanLoginMock,
}));

function makeSupabaseClient(options?: {
  sessionUserId?: string | null;
  childParentId?: string;
  insertError?: { message: string } | null;
}) {
  const sessionUserId =
    options && "sessionUserId" in options ? options.sessionUserId : "parent-1";
  const childParentId = options?.childParentId ?? "parent-1";
  const platformAccountsInsertMock = vi.fn((insertedAccount: Record<string, unknown>) => ({
    select: vi.fn(() => ({
      single: vi.fn().mockResolvedValue({
        data: options?.insertError
          ? null
          : {
              id: "platform-account-1",
              child_id: "child-1",
              platform: insertedAccount.platform ?? "khan-academy",
              external_account_ref:
                insertedAccount.external_account_ref ?? "school-account",
              auth_mode:
                insertedAccount.auth_mode ?? "manual_session",
              status: insertedAccount.status ?? "attention_required",
              managed_session_payload:
                insertedAccount.managed_session_payload ?? null,
              managed_session_captured_at:
                insertedAccount.managed_session_captured_at ?? null,
              managed_session_expires_at:
                insertedAccount.managed_session_expires_at ?? null,
              last_sync_error_summary:
                insertedAccount.last_sync_error_summary ?? null,
            },
        error: options?.insertError ?? null,
      }),
    })),
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
      if (table === "children") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((_column: string, childId: string) => ({
              eq: vi.fn((_parentColumn: string, parentId: string) => ({
                single: vi.fn().mockResolvedValue(
                  childId === "child-1" && parentId === childParentId
                    ? {
                        data: {
                          id: "child-1",
                          parent_id: childParentId,
                        },
                        error: null,
                      }
                    : {
                        data: null,
                        error: { message: "Child not found" },
                      }
                ),
              })),
            })),
          })),
        };
      }

      if (table === "platform_accounts") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({
                    data: null,
                    error: { message: "No rows found" },
                  }),
                })),
              })),
            })),
          })),
          insert: platformAccountsInsertMock,
        };
      }

      return {};
    }),
    _mocks: {
      platformAccountsInsertMock,
    },
  };
}

describe("platform connections route", () => {
  beforeEach(() => {
    createClientMock.mockReset();
    simulateIxlLoginMock.mockReset();
    simulateKhanLoginMock.mockReset();
  });

  it("rejects unauthenticated requests", async () => {
    createClientMock.mockResolvedValue(
      makeSupabaseClient({ sessionUserId: null })
    );

    const response = await POST(
      new Request("http://localhost/api/platform-connections", {
        method: "POST",
        body: JSON.stringify({
          childId: "child-1",
          platform: "khan-academy",
          username: "demo@khan.test",
          password: "secret123",
        }),
      })
    );

    expect(response.status).toBe(401);
  });

  it("creates a platform account scoped to child, platform, and account identity", async () => {
    const client = makeSupabaseClient();
    createClientMock.mockResolvedValue(client);

    const response = await POST(
      new Request("http://localhost/api/platform-connections", {
        method: "POST",
        body: JSON.stringify({
          childId: "child-1",
          platform: "khan-academy",
          username: "demo@khan.test",
          password: "secret123",
          externalAccountRef: "school-account",
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.account).toMatchObject({
      child_id: "child-1",
      platform: "khan-academy",
      external_account_ref: "school-account",
      auth_mode: "manual_session",
      status: "attention_required",
    });
  });

  it("stores managed session metadata for an IXL account and marks it active", async () => {
    const client = makeSupabaseClient();
    createClientMock.mockResolvedValue(client);

    const response = await POST(
      new Request("http://localhost/api/platform-connections", {
        method: "POST",
        body: JSON.stringify({
          childId: "child-1",
          platform: "ixl",
          username: "demo@ixl.test",
          externalAccountRef: "family-account",
          managedSessionPayload: {
            cookies: [
              {
                name: "PHPSESSID",
                value: "session-token",
              },
            ],
          },
          managedSessionCapturedAt: "2026-04-20T12:00:00.000Z",
          managedSessionExpiresAt: "2026-04-21T12:00:00.000Z",
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(client._mocks.platformAccountsInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        child_id: "child-1",
        platform: "ixl",
        external_account_ref: "family-account",
        status: "active",
        managed_session_payload: {
          cookies: [
            {
              name: "PHPSESSID",
              value: "session-token",
            },
          ],
        },
        managed_session_captured_at: "2026-04-20T12:00:00.000Z",
      })
    );
    expect(body.account).toMatchObject({
      platform: "ixl",
      external_account_ref: "family-account",
      status: "active",
      managed_session_payload: {
        cookies: [
          {
            name: "PHPSESSID",
            value: "session-token",
          },
        ],
      },
    });
  });

  it("stores managed session metadata for a Khan account and marks it active", async () => {
    const client = makeSupabaseClient();
    createClientMock.mockResolvedValue(client);

    const response = await POST(
      new Request("http://localhost/api/platform-connections", {
        method: "POST",
        body: JSON.stringify({
          childId: "child-1",
          platform: "khan-academy",
          username: "demo@khan.test",
          externalAccountRef: "school-account",
          managedSessionPayload: {
            cookies: [
              {
                name: "KAAS",
                value: "session-token",
              },
            ],
          },
          managedSessionCapturedAt: "2026-04-20T12:00:00.000Z",
          managedSessionExpiresAt: "2026-04-21T12:00:00.000Z",
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(client._mocks.platformAccountsInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        child_id: "child-1",
        platform: "khan-academy",
        external_account_ref: "school-account",
        status: "active",
        managed_session_payload: {
          cookies: [
            {
              name: "KAAS",
              value: "session-token",
            },
          ],
        },
        managed_session_captured_at: "2026-04-20T12:00:00.000Z",
      })
    );
    expect(body.account).toMatchObject({
      platform: "khan-academy",
      external_account_ref: "school-account",
      status: "active",
      managed_session_payload: {
        cookies: [
          {
            name: "KAAS",
            value: "session-token",
          },
        ],
      },
    });
  });

  it("allows a Raz-Kids account to be created in manual-session mode", async () => {
    createClientMock.mockResolvedValue(makeSupabaseClient());

    const response = await POST(
      new Request("http://localhost/api/platform-connections", {
        method: "POST",
        body: JSON.stringify({
          childId: "child-1",
          platform: "raz-kids",
          username: "demo@raz.test",
          authMode: "manual_session",
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.account).toMatchObject({
      platform: "raz-kids",
      auth_mode: "manual_session",
      status: "attention_required",
    });
  });

  it("rejects unsupported platforms outside the supported list", async () => {
    createClientMock.mockResolvedValue(makeSupabaseClient());

    const response = await POST(
      new Request("http://localhost/api/platform-connections", {
        method: "POST",
        body: JSON.stringify({
          childId: "child-1",
          platform: "mystery-platform",
          username: "demo@test",
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error:
        "Unsupported platform. Supported platforms are IXL, Khan Academy, Raz-Kids, and Epic.",
    });
  });

  it("blocks a parent from binding an account to another parent's child", async () => {
    createClientMock.mockResolvedValue(
      makeSupabaseClient({ childParentId: "parent-2" })
    );

    const response = await POST(
      new Request("http://localhost/api/platform-connections", {
        method: "POST",
        body: JSON.stringify({
          childId: "child-1",
          platform: "ixl",
          username: "demo@ixl.test",
          password: "secret123",
          externalAccountRef: "family-account",
        }),
      })
    );

    expect(response.status).toBe(404);
  });

  it("returns manual-session guidance when IXL auto login hits a captcha challenge", async () => {
    createClientMock.mockResolvedValue(makeSupabaseClient());
    simulateIxlLoginMock.mockResolvedValue({
      success: false,
      reason: "captcha_required",
      message:
        "IXL is requiring a CAPTCHA challenge. Automatic login is not possible at this time.",
    });

    const response = await POST(
      new Request("http://localhost/api/platform-connections", {
        method: "POST",
        body: JSON.stringify({
          childId: "child-1",
          platform: "ixl",
          username: "demo@ixl.test",
          authMode: "auto_login",
          loginPassword: "secret123",
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.reason).toBe("captcha_required");
    expect(body.manualSessionUrl).toBe("https://www.ixl.com/signin");
    expect(body.manualSessionTemplate).toEqual({
      cookies: [
        { name: "PHPSESSID", value: "" },
        { name: "ixl_user", value: "" },
      ],
    });
  });
});
