import { beforeEach, describe, expect, it, vi } from "vitest";
import { IxlManagedSessionError } from "@/lib/platform-adapters/ixl-fetch";

const createClientMock = vi.hoisted(() => vi.fn());
const runIxlManagedSessionSyncMock = vi.hoisted(() => vi.fn());
const runKhanManagedSessionSyncMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/platform-adapters/ixl-connector", () => ({
  runIxlManagedSessionSync: runIxlManagedSessionSyncMock,
}));

vi.mock("@/lib/platform-adapters/khan-connector", () => ({
  runKhanManagedSessionSync: runKhanManagedSessionSyncMock,
}));

import { POST } from "@/app/api/platform-sync/import/route";

function makeSupabaseClient(options?: {
  sessionUserId?: string | null;
  childParentId?: string;
  duplicateEvent?: boolean;
  duplicateJob?: boolean;
  platform?: "ixl" | "khan-academy" | "raz-kids";
  managedSessionPayload?: Record<string, unknown> | null;
  existingCheckIn?: boolean;
  homeworks?: Array<Record<string, unknown>>;
}) {
  const sessionUserId =
    options && "sessionUserId" in options ? options.sessionUserId : "parent-1";
  const childParentId = options?.childParentId ?? "parent-1";
  const platformAccountsUpdateMock = vi.fn(() => ({
    eq: vi.fn().mockResolvedValue({ error: null }),
  }));
  const platformSyncJobsUpdateMock = vi.fn(() => ({
    eq: vi.fn().mockResolvedValue({ error: null }),
  }));
  const learningEventsInsertMock = vi.fn(() => ({
    select: vi.fn(() => ({
      single: vi.fn().mockResolvedValue(
        options?.duplicateEvent
          ? {
              data: null,
              error: {
                message:
                  "duplicate key value violates unique constraint learning_events_account_source_key",
              },
            }
          : {
              data: {
                id: "event-1",
                child_id: "child-1",
                local_date_key: "2026-04-20",
              },
              error: null,
            }
      ),
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
      if (table === "platform_accounts") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: "acct-1",
                  child_id: "child-1",
                  platform: options?.platform ?? "ixl",
                  external_account_ref: "family-account",
                  managed_session_payload:
                    options?.managedSessionPayload ?? null,
                },
                error: null,
              }),
            })),
          })),
          update: platformAccountsUpdateMock,
        };
      }

      if (table === "platform_sync_jobs") {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue(
                options?.duplicateJob
                  ? {
                      data: null,
                      error: {
                        message:
                          "duplicate key value violates unique constraint platform_sync_jobs_account_window_key",
                      },
                    }
                  : {
                      data: {
                        id: "sync-job-1",
                        platform_account_id: "acct-1",
                        trigger_mode: "manual",
                        status: "running",
                      },
                      error: null,
                    }
              ),
            })),
          })),
          update: platformSyncJobsUpdateMock,
        };
      }

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

      if (table === "homeworks") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({
              data: options?.homeworks ?? [
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
                  data: options?.existingCheckIn
                    ? [
                        {
                          id: "manual-check-1",
                          homework_id: "hw-1",
                        },
                      ]
                    : [],
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
          insert: learningEventsInsertMock,
        };
      }

      if (table === "homework_auto_matches") {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: "match-1",
                },
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

      return {};
    }),
    _mocks: {
      platformAccountsUpdateMock,
      platformSyncJobsUpdateMock,
      learningEventsInsertMock,
    },
  };
}

describe("platform sync import route", () => {
  beforeEach(() => {
    createClientMock.mockReset();
    runIxlManagedSessionSyncMock.mockReset();
    runKhanManagedSessionSyncMock.mockReset();
  });

  it("rejects unauthenticated imports", async () => {
    createClientMock.mockResolvedValue(
      makeSupabaseClient({ sessionUserId: null })
    );

    const response = await POST(
      new Request("http://localhost/api/platform-sync/import", {
        method: "POST",
        body: JSON.stringify({
          platformAccountId: "acct-1",
          event: {
            occurredAt: "2026-04-20T10:00:00.000Z",
            eventType: "skill_practice",
            title: "IXL A.1",
            sourceRef: "ixl-a1-2026-04-20",
          },
        }),
      })
    );

    expect(response.status).toBe(401);
  });

  it("imports an event for the parent's child account and returns auto-checkin results", async () => {
    createClientMock.mockResolvedValue(makeSupabaseClient());

    const response = await POST(
      new Request("http://localhost/api/platform-sync/import", {
        method: "POST",
        body: JSON.stringify({
          platformAccountId: "acct-1",
          householdTimeZone: "Asia/Shanghai",
          event: {
            occurredAt: "2026-04-20T10:00:00.000Z",
            eventType: "skill_practice",
            title: "IXL A.1",
            subject: "math",
            durationMinutes: 25,
            score: 0.92,
            completionState: "completed",
            sourceRef: "ixl-a1-2026-04-20",
            rawPayload: {
              skill: "A.1",
            },
          },
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      jobStatus: "claimed",
      jobId: "sync-job-1",
      ingestStatus: "inserted",
      learningEventId: "event-1",
      homeworkResults: [
        {
          homeworkId: "hw-1",
          decision: "auto_completed",
          createdCheckInId: "check-1",
        },
      ],
    });
  });

  it("blocks imports to another parent's child account", async () => {
    createClientMock.mockResolvedValue(
      makeSupabaseClient({ childParentId: "parent-2" })
    );

    const response = await POST(
      new Request("http://localhost/api/platform-sync/import", {
        method: "POST",
        body: JSON.stringify({
          platformAccountId: "acct-1",
          event: {
            occurredAt: "2026-04-20T10:00:00.000Z",
            eventType: "skill_practice",
            title: "IXL A.1",
            sourceRef: "ixl-a1-2026-04-20",
          },
        }),
      })
    );

    expect(response.status).toBe(404);
  });

  it("returns duplicate when the same manual sync window was already claimed", async () => {
    createClientMock.mockResolvedValue(
      makeSupabaseClient({ duplicateJob: true })
    );

    const response = await POST(
      new Request("http://localhost/api/platform-sync/import", {
        method: "POST",
        body: JSON.stringify({
          platformAccountId: "acct-1",
          windowKey: "2026-04-20T10:00",
          event: {
            occurredAt: "2026-04-20T10:00:00.000Z",
            eventType: "skill_practice",
            title: "IXL A.1",
            sourceRef: "ixl-a1-2026-04-20",
          },
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      jobStatus: "duplicate",
      jobId: null,
      ingestStatus: null,
      learningEventId: null,
      localDateKey: null,
      homeworkResults: [],
    });
  });

  it("returns duplicate ingest without re-running auto-checkins", async () => {
    createClientMock.mockResolvedValue(
      makeSupabaseClient({ duplicateEvent: true })
    );

    const response = await POST(
      new Request("http://localhost/api/platform-sync/import", {
        method: "POST",
        body: JSON.stringify({
          platformAccountId: "acct-1",
          event: {
            occurredAt: "2026-04-20T10:00:00.000Z",
            eventType: "skill_practice",
            title: "IXL A.1",
            sourceRef: "ixl-a1-2026-04-20",
          },
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      jobStatus: "claimed",
      jobId: "sync-job-1",
      ingestStatus: "duplicate",
      learningEventId: null,
      localDateKey: "2026-04-20",
      homeworkResults: [],
      reviewStatus: null,
    });
  });

  it("accepts an IXL raw payload and normalizes it before import", async () => {
    createClientMock.mockResolvedValue(makeSupabaseClient());

    const response = await POST(
      new Request("http://localhost/api/platform-sync/import", {
        method: "POST",
        body: JSON.stringify({
          platformAccountId: "acct-1",
          rawEvent: {
            occurredAt: "2026-04-20T10:00:00.000Z",
            skillId: "A.1",
            skillName: "Add within 10",
            subject: "math",
            scorePercent: 92,
            durationSeconds: 1500,
            sessionId: "session-123",
          },
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      jobStatus: "claimed",
      ingestStatus: "inserted",
      learningEventId: "event-1",
      homeworkResults: [
        {
          homeworkId: "hw-1",
          decision: "auto_completed",
          createdCheckInId: "check-1",
        },
      ],
    });
  });

  it("accepts a Khan Academy raw payload and normalizes it before import", async () => {
    createClientMock.mockResolvedValue(
      makeSupabaseClient({ platform: "khan-academy" })
    );

    const response = await POST(
      new Request("http://localhost/api/platform-sync/import", {
        method: "POST",
        body: JSON.stringify({
          platformAccountId: "acct-1",
          rawEvent: {
            occurredAt: "2026-04-20T11:00:00.000Z",
            lessonId: "lesson-123",
            lessonTitle: "Fractions basics",
            courseName: "Math 3",
            masteryLevel: "practiced",
            progressPercent: 88,
            durationSeconds: 1800,
          },
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      jobStatus: "claimed",
      ingestStatus: "inserted",
      learningEventId: "event-1",
      homeworkResults: [
        {
          homeworkId: "hw-1",
          decision: "auto_completed",
          createdCheckInId: "check-1",
        },
      ],
    });
  });

  it("runs the Khan managed-session connector and imports the returned event set", async () => {
    createClientMock.mockResolvedValue(
      makeSupabaseClient({
        platform: "khan-academy",
        managedSessionPayload: {
          cookies: [{ name: "KAAS", value: "session-token" }],
        },
      })
    );
    runKhanManagedSessionSyncMock.mockResolvedValue({
      summary: {
        fetchedCount: 1,
      },
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
          rawPayload: {
            lessonId: "lesson-123",
          },
        },
      ],
    });

    const response = await POST(
      new Request("http://localhost/api/platform-sync/import", {
        method: "POST",
        body: JSON.stringify({
          platformAccountId: "acct-1",
          fetchMode: "managed_session",
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(runKhanManagedSessionSyncMock).toHaveBeenCalledWith({
      account: expect.objectContaining({
        id: "acct-1",
        platform: "khan-academy",
      }),
    });
    expect(body).toMatchObject({
      jobStatus: "claimed",
      ingestStatus: "inserted",
      learningEventId: "event-1",
      importedEventCount: 1,
      fetchSummary: {
        fetchedCount: 1,
      },
    });
  });

  it("runs the IXL managed-session connector and imports the returned event set", async () => {
    createClientMock.mockResolvedValue(
      makeSupabaseClient({
        managedSessionPayload: {
          cookies: [
            {
              name: "PHPSESSID",
              value: "session-token",
            },
          ],
        },
      })
    );
    runIxlManagedSessionSyncMock.mockResolvedValue({
      summary: {
        fetchedCount: 1,
      },
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
          rawPayload: {
            skillId: "A.1",
          },
        },
      ],
    });

    const response = await POST(
      new Request("http://localhost/api/platform-sync/import", {
        method: "POST",
        body: JSON.stringify({
          platformAccountId: "acct-1",
          fetchMode: "managed_session",
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(runIxlManagedSessionSyncMock).toHaveBeenCalledWith({
      account: expect.objectContaining({
        id: "acct-1",
        platform: "ixl",
      }),
    });
    expect(body).toMatchObject({
      jobStatus: "claimed",
      jobId: "sync-job-1",
      ingestStatus: "inserted",
      learningEventId: "event-1",
      homeworkResults: [
        {
          homeworkId: "hw-1",
          decision: "auto_completed",
          createdCheckInId: "check-1",
        },
      ],
      fetchSummary: {
        fetchedCount: 1,
      },
    });
  });

  it("imports each fetched IXL managed-session event and returns aggregate counts", async () => {
    createClientMock.mockResolvedValue(
      makeSupabaseClient({
        managedSessionPayload: {
          cookies: [{ name: "PHPSESSID", value: "session-token" }],
        },
      })
    );
    runIxlManagedSessionSyncMock.mockResolvedValue({
      summary: {
        fetchedCount: 2,
      },
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
        {
          occurredAt: "2026-04-20T11:00:00.000Z",
          eventType: "skill_practice",
          title: "IXL B.2 Subtract within 20",
          subject: "math",
          durationMinutes: 30,
          score: 0.97,
          completionState: "completed",
          sourceRef: "session-124",
          rawPayload: { skillId: "B.2" },
        },
      ],
    });

    const response = await POST(
      new Request("http://localhost/api/platform-sync/import", {
        method: "POST",
        body: JSON.stringify({
          platformAccountId: "acct-1",
          fetchMode: "managed_session",
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.fetchSummary).toEqual({ fetchedCount: 2 });
    expect(body.importedEventCount).toBe(2);
    expect(body.learningEventIds).toEqual(["event-1", "event-1"]);
    expect(body.homeworkResults).toHaveLength(2);
  });

  it("marks the account attention_required when the IXL managed session is expired", async () => {
    const client = makeSupabaseClient({
      managedSessionPayload: {
        cookies: [{ name: "PHPSESSID", value: "session-token" }],
      },
    });
    createClientMock.mockResolvedValue(client);
    runIxlManagedSessionSyncMock.mockRejectedValue(
      new IxlManagedSessionError("Managed IXL session expired")
    );

    const response = await POST(
      new Request("http://localhost/api/platform-sync/import", {
        method: "POST",
        body: JSON.stringify({
          platformAccountId: "acct-1",
          fetchMode: "managed_session",
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      jobStatus: "attention_required",
      jobId: "sync-job-1",
      status: "attention_required",
      error: "Managed IXL session expired",
    });
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

  it("marks the sync job failed with retry metadata for retryable IXL fetch errors", async () => {
    const client = makeSupabaseClient({
      managedSessionPayload: {
        cookies: [{ name: "PHPSESSID", value: "session-token" }],
      },
    });
    createClientMock.mockResolvedValue(client);
    runIxlManagedSessionSyncMock.mockRejectedValue(
      new Error("Unexpected IXL page shape")
    );

    const response = await POST(
      new Request("http://localhost/api/platform-sync/import", {
        method: "POST",
        body: JSON.stringify({
          platformAccountId: "acct-1",
          fetchMode: "managed_session",
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      jobStatus: "failed",
      jobId: "sync-job-1",
      status: "failed",
      error: "Unexpected IXL page shape",
      retryCount: 1,
    });
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

  it("preserves manual completion precedence when imported activity matches an already completed homework", async () => {
    createClientMock.mockResolvedValue(
      makeSupabaseClient({ existingCheckIn: true })
    );

    const response = await POST(
      new Request("http://localhost/api/platform-sync/import", {
        method: "POST",
        body: JSON.stringify({
          platformAccountId: "acct-1",
          event: {
            occurredAt: "2026-04-20T10:00:00.000Z",
            eventType: "skill_practice",
            title: "IXL A.1",
            subject: "math",
            durationMinutes: 25,
            score: 0.92,
            completionState: "completed",
            sourceRef: "ixl-a1-2026-04-20",
            rawPayload: {
              skill: "A.1",
            },
          },
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      jobStatus: "claimed",
      ingestStatus: "inserted",
      learningEventId: "event-1",
      homeworkResults: [
        {
          homeworkId: "hw-1",
          decision: "already_completed",
          createdCheckInId: null,
        },
      ],
    });
  });

  it("returns unmatched review status when imported activity is stored but does not match any same-day homework", async () => {
    createClientMock.mockResolvedValue(
      makeSupabaseClient({ homeworks: [] })
    );

    const response = await POST(
      new Request("http://localhost/api/platform-sync/import", {
        method: "POST",
        body: JSON.stringify({
          platformAccountId: "acct-1",
          event: {
            occurredAt: "2026-04-20T10:00:00.000Z",
            eventType: "skill_practice",
            title: "IXL A.1",
            subject: "math",
            durationMinutes: 25,
            score: 0.92,
            completionState: "completed",
            sourceRef: "ixl-a1-2026-04-20",
            rawPayload: {
              skill: "A.1",
            },
          },
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      jobStatus: "claimed",
      ingestStatus: "inserted",
      learningEventId: "event-1",
      homeworkResults: [],
      reviewStatus: "unmatched",
    });
  });

  it("rejects raw payload import for platforms without an adapter yet", async () => {
    createClientMock.mockResolvedValue(
      makeSupabaseClient({ platform: "raz-kids" })
    );

    const response = await POST(
      new Request("http://localhost/api/platform-sync/import", {
        method: "POST",
        body: JSON.stringify({
          platformAccountId: "acct-1",
          rawEvent: {
            occurredAt: "2026-04-20T11:00:00.000Z",
            sessionId: "reading-session-1",
          },
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: "Raw event import not supported for platform raz-kids",
    });
  });
});
