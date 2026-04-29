import { describe, expect, it, vi } from "vitest";
import { applyAutoCheckinMatches } from "@/lib/auto-checkins";

describe("applyAutoCheckinMatches", () => {
  it("creates one auto check-in from the earliest matching event and preserves later matches as supporting evidence", async () => {
    const checkInInsertMock = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "check-1",
            homework_id: "hw-1",
          },
          error: null,
        }),
      })),
    }));
    const matchInsertMock = vi.fn((payload: Record<string, unknown>) => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: {
            id: `match-${String(payload.learning_event_id)}`,
          },
          error: null,
        }),
      })),
    }));

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "check_ins") {
          return {
            insert: checkInInsertMock,
          };
        }

        return {
          insert: matchInsertMock,
        };
      }),
    };

    const result = await applyAutoCheckinMatches({
      supabase: supabase as any,
      childId: "child-1",
      homework: {
        id: "hw-1",
        child_id: "child-1",
        point_value: 5,
        estimated_minutes: 20,
        required_checkpoint_type: null,
      },
      matches: [
        {
          learningEventId: "event-2",
          matchedAt: "2026-04-20T16:10:00.000Z",
          matchRule: "duration_threshold",
          durationMinutes: 25,
        },
        {
          learningEventId: "event-1",
          matchedAt: "2026-04-20T15:50:00.000Z",
          matchRule: "duration_threshold",
          durationMinutes: 25,
        },
      ],
      existingCheckIn: null,
    });

    expect(checkInInsertMock).toHaveBeenCalledTimes(1);
    expect(checkInInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        homework_id: "hw-1",
        child_id: "child-1",
        points_earned: 5,
        awarded_points: 5,
        is_scored: true,
        proof_type: null,
      })
    );
    expect(matchInsertMock).toHaveBeenCalledTimes(2);
    expect(matchInsertMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        homework_id: "hw-1",
        learning_event_id: "event-1",
        match_rule: "duration_threshold",
        match_result: "auto_completed",
        is_primary: true,
        triggered_check_in_id: "check-1",
      })
    );
    expect(matchInsertMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        homework_id: "hw-1",
        learning_event_id: "event-2",
        match_rule: "duration_threshold",
        match_result: "supporting_evidence",
        is_primary: false,
        triggered_check_in_id: null,
      })
    );
    expect(result).toMatchObject({
      decision: "auto_completed",
      createdCheckInId: "check-1",
      primaryLearningEventId: "event-1",
    });
  });

  it("stores a partially completed match without creating a check-in when attachment proof is still required", async () => {
    const checkInInsertMock = vi.fn();
    const matchInsertMock = vi.fn((payload: Record<string, unknown>) => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "match-1",
            match_result: payload.match_result,
          },
          error: null,
        }),
      })),
    }));

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "check_ins") {
          return {
            insert: checkInInsertMock,
          };
        }

        return {
          insert: matchInsertMock,
        };
      }),
    };

    const result = await applyAutoCheckinMatches({
      supabase: supabase as any,
      childId: "child-1",
      homework: {
        id: "hw-audio-1",
        child_id: "child-1",
        point_value: 4,
        estimated_minutes: 20,
        required_checkpoint_type: "audio",
      },
      matches: [
        {
          learningEventId: "event-audio-1",
          matchedAt: "2026-04-20T15:50:00.000Z",
          matchRule: "duration_threshold",
          durationMinutes: 20,
        },
      ],
      existingCheckIn: null,
    });

    expect(checkInInsertMock).not.toHaveBeenCalled();
    expect(matchInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        homework_id: "hw-audio-1",
        learning_event_id: "event-audio-1",
        match_result: "partially_completed",
        is_primary: true,
        triggered_check_in_id: null,
      })
    );
    expect(result).toMatchObject({
      decision: "partially_completed",
      createdCheckInId: null,
      primaryLearningEventId: "event-audio-1",
    });
  });

  it("does not create a second auto check-in when the homework was already completed earlier", async () => {
    const checkInInsertMock = vi.fn();
    const matchInsertMock = vi.fn((payload: Record<string, unknown>) => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "match-existing",
            match_result: payload.match_result,
          },
          error: null,
        }),
      })),
    }));

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "check_ins") {
          return {
            insert: checkInInsertMock,
          };
        }

        return {
          insert: matchInsertMock,
        };
      }),
    };

    const result = await applyAutoCheckinMatches({
      supabase: supabase as any,
      childId: "child-1",
      homework: {
        id: "hw-1",
        child_id: "child-1",
        point_value: 5,
        estimated_minutes: 20,
        required_checkpoint_type: null,
      },
      matches: [
        {
          learningEventId: "event-1",
          matchedAt: "2026-04-20T15:50:00.000Z",
          matchRule: "duration_threshold",
          durationMinutes: 25,
        },
      ],
      existingCheckIn: {
        id: "manual-check-1",
      },
    });

    expect(checkInInsertMock).not.toHaveBeenCalled();
    expect(matchInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        homework_id: "hw-1",
        learning_event_id: "event-1",
        match_result: "already_completed",
        is_primary: true,
        triggered_check_in_id: "manual-check-1",
      })
    );
    expect(result).toMatchObject({
      decision: "already_completed",
      createdCheckInId: null,
      primaryLearningEventId: "event-1",
    });
  });
});
