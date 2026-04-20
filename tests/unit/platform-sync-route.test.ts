import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/platform-sync/run/route";

const createClientMock = vi.hoisted(() => vi.fn());
const createServiceRoleClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
  createServiceRoleClient: createServiceRoleClientMock,
}));

function makeSyncRouteClient() {
  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: {
            user: { id: "parent-1" },
          },
        },
      }),
    },
    from: vi.fn((table: string) => {
      if (table === "platform_accounts") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => ({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: "acct-active",
                    child_id: "child-1",
                    platform: "ixl",
                    external_account_ref: "family",
                    status: "active",
                  },
                  {
                    id: "acct-attention",
                    child_id: "child-2",
                    platform: "khan-academy",
                    external_account_ref: "school",
                    status: "attention_required",
                  },
                ],
                error: null,
              }),
            })),
          })),
        };
      }

      if (table === "platform_sync_jobs") {
        return {
          insert: vi.fn((payload: Record<string, unknown>) => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue(
                payload.platform_account_id === "acct-active"
                  ? {
                      data: {
                        id: "sync-job-1",
                        platform_account_id: "acct-active",
                        window_key: payload.window_key,
                        status: "running",
                      },
                      error: null,
                    }
                  : {
                      data: null,
                      error: {
                        message:
                          "duplicate key value violates unique constraint platform_sync_jobs_account_window_key",
                      },
                    }
              ),
            })),
          })),
        };
      }

      return {
        update: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ error: null }),
        })),
      };
    }),
  };
}

describe("platform sync run route", () => {
  beforeEach(() => {
    createClientMock.mockReset();
    createServiceRoleClientMock.mockReset();
  });

  it("claims jobs for active accounts and reports attention_required accounts as skipped", async () => {
    createClientMock.mockResolvedValue(makeSyncRouteClient());

    const response = await GET(
      new Request(
        "http://localhost/api/platform-sync/run?platforms=ixl,khan-academy&scheduleWindow=after-school&now=2026-04-20T10:30:00.000Z"
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.scheduleWindow).toBe("after-school");
    expect(body.windowKey).toBe("2026-04-20:after-school");
    expect(body.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          platformAccountId: "acct-active",
          status: "claimed",
        }),
        expect.objectContaining({
          platformAccountId: "acct-attention",
          status: "attention_required",
        }),
      ])
    );
  });

  it("uses the evening fixed batch window when the local time is after 20:00", async () => {
    createClientMock.mockResolvedValue(makeSyncRouteClient());

    const response = await GET(
      new Request(
        "http://localhost/api/platform-sync/run?platforms=ixl&now=2026-04-20T12:30:00.000Z"
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.scheduleWindow).toBe("evening-review");
    expect(body.windowKey).toBe("2026-04-20:evening-review");
  });

  it("rejects unknown fixed batch windows", async () => {
    createClientMock.mockResolvedValue(makeSyncRouteClient());

    const response = await GET(
      new Request(
        "http://localhost/api/platform-sync/run?scheduleWindow=lunch-sync"
      )
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: "Invalid schedule window lunch-sync",
    });
  });
});
