import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  buildSubmissionDecision,
  getProofLabel,
  isMissingCheckInScoringColumnError,
  isProofType,
} from "@/lib/tasks/check-in-submission";
import { POST } from "@/app/api/check-ins/create/route";

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
          insert,
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

  it("returns a friendly upgrade message when scoring columns are missing", async () => {
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

    expect(response.status).toBe(503);
    expect(body.error).toContain("数据库结构还没有完成升级");
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
});
