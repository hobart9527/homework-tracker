import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/platform-connections/route";

const createClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

function makeSupabaseClient(options?: {
  sessionUserId?: string | null;
  childParentId?: string;
  insertError?: { message: string } | null;
}) {
  const sessionUserId =
    options && "sessionUserId" in options ? options.sessionUserId : "parent-1";
  const childParentId = options?.childParentId ?? "parent-1";

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
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: options?.insertError
                  ? null
                  : {
                      id: "platform-account-1",
                      child_id: "child-1",
                      platform: "khan-academy",
                      external_account_ref: "school-account",
                      auth_mode: "account_password_managed_session",
                      status: "attention_required",
                    },
                error: options?.insertError ?? null,
              }),
            })),
          })),
        };
      }

      return {};
    }),
  };
}

describe("platform connections route", () => {
  beforeEach(() => {
    createClientMock.mockReset();
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
      auth_mode: "account_password_managed_session",
      status: "attention_required",
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
});
