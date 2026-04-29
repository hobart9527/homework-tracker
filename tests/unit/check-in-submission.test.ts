import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  buildSubmissionDecision,
  buildCheckInInsertPayload,
  getProofLabel,
  isMissingCheckInScoringColumnError,
  isProofType,
} from "@/lib/tasks/check-in-submission";
import { POST } from "@/app/api/check-ins/create/route";
import { formatDateKey, parseDateValue } from "@/lib/homework-utils";

const createClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

type HomeworkFixture = {
  point_value: number | null;
  daily_cutoff_time: string | null;
  required_checkpoint_type: "photo" | "audio" | null;
};

type CheckInFixture = {
  is_scored?: boolean | null;
  awarded_points?: number | null;
  points_earned?: number | null;
};

type SchemaMismatchError = {
  message: string;
};

function makeHomework(
  overrides: Partial<HomeworkFixture> = {}
): HomeworkFixture {
  return {
    point_value: 3,
    daily_cutoff_time: "20:00",
    required_checkpoint_type: null,
    ...overrides,
  };
}

function makeCheckIn(
  overrides: Partial<CheckInFixture> = {}
): CheckInFixture {
  return {
    is_scored: false,
    ...overrides,
  };
}

function makeSupabaseClient(overrides: {
  insertError?: SchemaMismatchError | null;
  legacyInsertError?: SchemaMismatchError | null;
}) {
  const homework = {
    id: "hw-1",
    child_id: "child-1",
    point_value: 3,
    daily_cutoff_time: "20:00",
    required_checkpoint_type: null,
  };

  const insert = vi.fn(() =>
    ({
      select: () => ({
        single: vi.fn().mockResolvedValue({
          data: null,
          error: overrides.insertError,
        }),
      }),
    } as any)
  );

  const legacyInsert = vi.fn(() =>
    ({
      select: () => ({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "legacy-check-1",
            homework_id: "hw-1",
            child_id: "child-1",
            completed_at: "2026-04-11T19:00:00.000Z",
            points_earned: 3,
            note: null,
            created_at: "2026-04-11T19:00:00.000Z",
          },
          error: overrides.legacyInsertError ?? null,
        }),
      }),
    } as any)
  );

  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: {
            user: { id: "child-1" },
          },
        },
      }),
    },
    from: vi.fn((table: string) => {
      if (table === "homeworks") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: vi.fn().mockResolvedValue({
                  data: homework,
                  error: null,
                }),
              }),
            }),
          }),
        };
      }

      if (table === "check_ins") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                gte: () => ({
                  lte: vi.fn().mockResolvedValue({
                    data: [],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
          insert: vi.fn((payload: Record<string, unknown>) => {
            if ("awarded_points" in payload || "is_scored" in payload || "is_late" in payload) {
              return insert();
            }

            return legacyInsert();
          }),
        };
      }

      return {};
    }),
  };
}

describe("buildSubmissionDecision", () => {
  it("accepts only valid proof types", () => {
    expect(isProofType("photo")).toBe(true);
    expect(isProofType("audio")).toBe(true);
    expect(isProofType("screenshot")).toBe(false);
    expect(isProofType("video")).toBe(false);
  });

  it("uses the unified photo proof label", () => {
    expect(getProofLabel("photo")).toBe("照片");
    expect(getProofLabel("audio")).toBe("录音");
  });

  it("awards points only on the first valid same-day submission", () => {
    const result = buildSubmissionDecision({
      homework: makeHomework(),
      existingSameDay: [],
      proofType: null,
      now: new Date("2026-04-11T19:00:00"),
    } as any);

    expect(result.scored).toBe(true);
    expect(result.awardedPoints).toBe(3);
  });

  it("allows repeat same-day submissions without awarding points", () => {
    const result = buildSubmissionDecision({
      homework: makeHomework(),
      existingSameDay: [makeCheckIn({ is_scored: true })],
      proofType: null,
      now: new Date("2026-04-11T19:00:00"),
    } as any);

    expect(result.scored).toBe(false);
    expect(result.message).toContain("不重复加分");
  });

  it("treats legacy same-day submissions with awarded points as already scored", () => {
    const result = buildSubmissionDecision({
      homework: makeHomework(),
      existingSameDay: [makeCheckIn({ is_scored: false, awarded_points: 3 })],
      proofType: null,
      now: new Date("2026-04-11T19:00:00"),
    } as any);

    expect(result.scored).toBe(false);
    expect(result.awardedPoints).toBe(0);
    expect(result.message).toContain("不重复加分");
  });

  it("rejects missing proof when homework requires photo", () => {
    expect(() =>
      buildSubmissionDecision({
        homework: makeHomework({ required_checkpoint_type: "photo" }),
        existingSameDay: [],
        proofType: null,
        now: new Date("2026-04-11T19:00:00"),
      } as any)
    ).toThrow(/照片/);
  });

  it("includes recorded audio duration in the check-in payload", () => {
    const result = buildSubmissionDecision({
      homework: makeHomework(),
      existingSameDay: [],
      proofType: "audio",
      now: new Date("2026-04-11T19:00:00"),
    } as any);

    expect(
      buildCheckInInsertPayload({
        homeworkId: "hw-1",
        childId: "child-1",
        completedAt: "2026-04-11T19:00:00.000Z",
        proofType: "audio",
        audioDurationSeconds: 37,
        result,
      } as any)
    ).toMatchObject({
      proof_type: "audio",
      audio_duration_seconds: 37,
    });
  });

  it("keeps submitted_at separate from the completion date when the task is checked in for a selected day", () => {
    const result = buildSubmissionDecision({
      homework: makeHomework(),
      existingSameDay: [],
      proofType: null,
      now: new Date("2026-04-11T19:00:00"),
    } as any);

    expect(
      buildCheckInInsertPayload({
        homeworkId: "hw-1",
        childId: "child-1",
        completedAt: "2026-04-24T12:00:00.000Z",
        submittedAt: "2026-04-23T23:30:00.000Z",
        proofType: null,
        result,
      } as any)
    ).toMatchObject({
      completed_at: "2026-04-24T12:00:00.000Z",
      submitted_at: "2026-04-23T23:30:00.000Z",
    });
  });
});

describe("isMissingCheckInScoringColumnError", () => {
  it.each([
    "Could not find the 'awarded_points' column of 'check_ins' in the schema cache",
    "Could not find the 'is_scored' column of 'check_ins' in the schema cache",
    "Could not find the 'is_late' column of 'check_ins' in the schema cache",
    "Could not find the 'proof_type' column of 'check_ins' in the schema cache",
  ])("detects stale schema errors mentioning %s", (message) => {
    expect(isMissingCheckInScoringColumnError(message)).toBe(true);
  });

  it("does not match messages that merely mention a scoring column", () => {
    expect(
      isMissingCheckInScoringColumnError(
        "The import failed because awarded_points is invalid"
      )
    ).toBe(false);
  });

  it("ignores unrelated insert errors", () => {
    expect(isMissingCheckInScoringColumnError("duplicate key value violates unique constraint")).toBe(false);
  });
});

describe("check-in create route", () => {
  beforeEach(() => {
    createClientMock.mockReset();
  });

  it("falls back to the legacy schema when scoring columns are missing", async () => {
    createClientMock.mockResolvedValue(
      makeSupabaseClient({
        insertError: {
          message:
            "Could not find the 'awarded_points' column of 'check_ins' in the schema cache",
        },
      })
    );

    const response = await POST(
      new Request("http://localhost/api/check-ins/create", {
        method: "POST",
        body: JSON.stringify({
          homework_id: "hw-1",
          proofType: null,
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      scored: true,
      awardedPoints: 3,
      checkIn: {
        id: "legacy-check-1",
        awarded_points: 3,
        is_scored: true,
        is_late: false,
        proof_type: null,
      },
    });
  });

  it("keeps generic insert errors as 500 responses", async () => {
    createClientMock.mockResolvedValue(
      makeSupabaseClient({
        insertError: {
          message: "duplicate key value violates unique constraint",
        },
      })
    );

    const response = await POST(
      new Request("http://localhost/api/check-ins/create", {
        method: "POST",
        body: JSON.stringify({
          homework_id: "hw-1",
          proofType: null,
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("duplicate key value violates unique constraint");
  });

  it("records a selected target date as the completion day while keeping submission time as now", async () => {
    const insertPayloads: Array<Record<string, unknown>> = [];
    const client = makeSupabaseClient({});
    const originalFrom = client.from;

    client.from = vi.fn((table: string) => {
      const source = originalFrom(table);

      if (table !== "check_ins") {
        return source;
      }

      return {
        ...source,
        insert: vi.fn((payload: Record<string, unknown>) => {
          insertPayloads.push(payload);
          return {
            select: () => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: "check-1",
                  ...payload,
                },
                error: null,
              }),
            }),
          };
        }),
      };
    });

    createClientMock.mockResolvedValue(client);

    const response = await POST(
      new Request("http://localhost/api/check-ins/create", {
        method: "POST",
        body: JSON.stringify({
          homework_id: "hw-1",
          targetDate: "2026-04-24",
          proofType: null,
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(
      formatDateKey(parseDateValue(String(insertPayloads[0]?.completed_at)))
    ).toBe("2026-04-24");
    expect(insertPayloads[0]?.submitted_at).not.toBe(insertPayloads[0]?.completed_at);
  });
});
