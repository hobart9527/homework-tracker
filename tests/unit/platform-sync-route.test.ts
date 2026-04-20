import { beforeEach, describe, expect, it, vi } from "vitest";
import { IxlManagedSessionError } from "@/lib/platform-adapters/ixl-fetch";

const createClientMock = vi.hoisted(() => vi.fn());
const createServiceRoleClientMock = vi.hoisted(() => vi.fn());
const runIxlManagedSessionSyncMock = vi.hoisted(() => vi.fn());
const runKhanManagedSessionSyncMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
  createServiceRoleClient: createServiceRoleClientMock,
}));

vi.mock("@/lib/platform-adapters/ixl-connector", () => ({
  runIxlManagedSessionSync: runIxlManagedSessionSyncMock,
}));

vi.mock("@/lib/platform-adapters/khan-connector", () => ({
  runKhanManagedSessionSync: runKhanManagedSessionSyncMock,
}));

import { GET } from "@/app/api/platform-sync/run/route";

function makeSyncRouteClient(options?: { includeRetryJobs?: boolean }) {
  const platformAccountsUpdateMock = vi.fn(() => ({
    eq: vi.fn().mockResolvedValue({ error: null }),
  }));
  const platformSyncJobsUpdateMock = vi.fn(() => ({
    eq: vi.fn().mockResolvedValue({ error: null }),
  }));

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
                    managed_session_payload: {
                      cookies: [
                        {
                          name: "PHPSESSID",
                          value: "session-token",
                        },
                      ],
                    },
                  },
                  {
                    id: "acct-attention",
                    child_id: "child-2",
                    platform: "khan-academy",
                    external_account_ref: "school",
                    status: "active",
                    managed_session_payload: {
                      cookies: [
                        {
                          name: "KAAS",
                          value: "khan-session-token",
                        },
                      ],
                    },
                  },
                ],
                error: null,
              }),
            })),
            eq: vi.fn((_column: string, accountId: string) => ({
              single: vi.fn().mockResolvedValue({
                data:
                  accountId === "acct-retry"
                    ? {
                        id: "acct-retry",
                        child_id: "child-3",
                        platform: "ixl",
                        external_account_ref: "retry-family",
                        status: "failed",
                        managed_session_payload: {
                          cookies: [
                            {
                              name: "PHPSESSID",
                              value: "retry-session-token",
                            },
                          ],
                        },
                      }
                    : null,
                error: accountId === "acct-retry" ? null : { message: "Not found" },
              }),
            })),
          })),
          update: platformAccountsUpdateMock,
        };
      }

      if (table === "platform_sync_jobs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((_column: string, status: string) => ({
              lte: vi.fn((_retryColumn: string, _nowIso: string) => ({
                order: vi.fn().mockResolvedValue({
                  data:
                    status === "failed" && options?.includeRetryJobs
                      ? [
                          {
                            id: "sync-job-retry-1",
                            platform_account_id: "acct-retry",
                            status: "failed",
                            retry_count: 1,
                            next_retry_at: "2026-04-20T10:00:00.000Z",
                          },
                        ]
                      : [],
                  error: null,
                }),
              })),
            })),
          })),
          insert: vi.fn((payload: Record<string, unknown>) => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue(
                payload.platform_account_id === "acct-active" ||
                  payload.platform_account_id === "acct-attention"
                  ? {
                      data: {
                        id:
                          payload.platform_account_id === "acct-active"
                            ? "sync-job-1"
                            : "sync-job-2",
                        platform_account_id: String(payload.platform_account_id),
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
          update: platformSyncJobsUpdateMock,
        };
      }

      if (table === "homeworks") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "hw-1",
                  child_id: "child-1",
                  title: "Math",
                  repeat_type: "daily",
                  repeat_days: null,
                  repeat_interval: null,
                  repeat_start_date: null,
                  repeat_end_date: null,
                  point_value: 5,
                  estimated_minutes: 20,
                  required_checkpoint_type: null,
                  is_active: true,
                },
              ],
              error: null,
            }),
          })),
        };
      }

      if (table === "check_ins") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              gte: vi.fn(() => ({
                lte: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              })),
            })),
          })),
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: "check-1",
                  homework_id: "hw-1",
                },
                error: null,
              }),
            })),
          })),
        };
      }

      if (table === "learning_events") {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: "event-1",
                  child_id: "child-1",
                  local_date_key: "2026-04-20",
                },
                error: null,
              }),
            })),
          })),
        };
      }

      if (table === "homework_auto_matches") {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: { id: "match-1" },
                error: null,
              }),
            })),
          })),
        };
      }

      if (table === "learning_event_reviews") {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: "review-1",
                  learning_event_id: "event-1",
                  review_status: "unmatched",
                },
                error: null,
              }),
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
    _mocks: {
      platformAccountsUpdateMock,
      platformSyncJobsUpdateMock,
    },
  };
}

describe("platform sync run route", () => {
  beforeEach(() => {
    createClientMock.mockReset();
    createServiceRoleClientMock.mockReset();
    runIxlManagedSessionSyncMock.mockReset();
    runKhanManagedSessionSyncMock.mockReset();
  });

  it("claims jobs for active accounts and reports attention_required accounts as skipped", async () => {
    createClientMock.mockResolvedValue(makeSyncRouteClient());
    runIxlManagedSessionSyncMock.mockResolvedValue({
      summary: { fetchedCount: 1 },
      events: [
        {
          occurredAt: "2026-04-20T10:00:00.000Z",
          eventType: "skill_practice",
          title: "IXL A.1 Add within 10",
          subject: "math",
          durationMinutes: 25,
          score: 0.92,
          completionState: "completed",
          sourceRef: "session-123",
          rawPayload: { skillId: "A.1" },
        },
      ],
    });
    runKhanManagedSessionSyncMock.mockResolvedValue({
      summary: { fetchedCount: 1 },
      events: [
        {
          occurredAt: "2026-04-20T11:00:00.000Z",
          eventType: "lesson_completed",
          title: "Khan Academy Fractions basics",
          subject: "Math 3",
          durationMinutes: 30,
          score: 0.88,
          completionState: "practiced",
          sourceRef: "lesson-123",
          rawPayload: { lessonId: "lesson-123" },
        },
      ],
    });

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
          status: "completed",
          importedEventCount: 1,
        }),
        expect.objectContaining({
          platformAccountId: "acct-attention",
          status: "completed",
          importedEventCount: 1,
        }),
      ])
    );
  });

  it("marks an IXL account attention_required when scheduled managed-session sync fails", async () => {
    const client = makeSyncRouteClient();
    createClientMock.mockResolvedValue(client);
    runIxlManagedSessionSyncMock.mockRejectedValue(
      new IxlManagedSessionError("Managed IXL session expired")
    );

    const response = await GET(
      new Request(
        "http://localhost/api/platform-sync/run?platforms=ixl&scheduleWindow=after-school&now=2026-04-20T10:30:00.000Z"
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          platformAccountId: "acct-active",
          status: "attention_required",
          error: "Managed IXL session expired",
        }),
      ])
    );
    expect(client._mocks.platformSyncJobsUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "attention_required",
        error_summary: "Managed IXL session expired",
      })
    );
    expect(client._mocks.platformAccountsUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "attention_required",
      })
    );
  });

  it("records retryable scheduled sync failures without forcing attention_required", async () => {
    const client = makeSyncRouteClient();
    createClientMock.mockResolvedValue(client);
    runIxlManagedSessionSyncMock.mockRejectedValue(
      new Error("Unexpected IXL page shape")
    );

    const response = await GET(
      new Request(
        "http://localhost/api/platform-sync/run?platforms=ixl&scheduleWindow=after-school&now=2026-04-20T10:30:00.000Z"
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          platformAccountId: "acct-active",
          status: "failed",
          error: "Unexpected IXL page shape",
          retryCount: 1,
        }),
      ])
    );
    expect(client._mocks.platformSyncJobsUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error_summary: "Unexpected IXL page shape",
        retry_count: 1,
        next_retry_at: expect.any(String),
      })
    );
    expect(client._mocks.platformAccountsUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        last_sync_error_summary: "Unexpected IXL page shape",
      })
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

  it("retries failed sync jobs whose retry window is due", async () => {
    createClientMock.mockResolvedValue(
      makeSyncRouteClient({ includeRetryJobs: true })
    );
    runIxlManagedSessionSyncMock.mockResolvedValue({
      summary: { fetchedCount: 1 },
      events: [
        {
          occurredAt: "2026-04-20T10:00:00.000Z",
          eventType: "skill_practice",
          title: "IXL A.1 Add within 10",
          subject: "math",
          durationMinutes: 25,
          score: 0.92,
          completionState: "completed",
          sourceRef: "session-123",
          rawPayload: { skillId: "A.1" },
        },
      ],
    });

    const response = await GET(
      new Request(
        "http://localhost/api/platform-sync/run?platforms=ixl&scheduleWindow=after-school&now=2026-04-20T10:30:00.000Z"
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          platformAccountId: "acct-retry",
          status: "completed",
          importedEventCount: 1,
          retriedJobId: "sync-job-retry-1",
        }),
      ])
    );
    expect(body.retryJobCount).toBe(1);
  });
});
