import { describe, expect, it, vi } from "vitest";
import { runRazKidsManagedSessionSync } from "@/lib/platform-adapters/raz-kids-connector";

const fetchRazKidsManagedSessionActivitiesMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/platform-adapters/raz-kids-fetch", async () => {
  const actual = await vi.importActual("@/lib/platform-adapters/raz-kids-fetch");

  return {
    ...actual,
    fetchRazKidsManagedSessionActivities: fetchRazKidsManagedSessionActivitiesMock,
  };
});

describe("runRazKidsManagedSessionSync", () => {
  it("rejects a Raz-Kids account without a managed session", async () => {
    await expect(
      runRazKidsManagedSessionSync({
        account: {
          id: "acct-1",
          platform: "raz-kids",
          managed_session_payload: null,
        },
      })
    ).rejects.toMatchObject({
      name: "RazKidsManagedSessionError",
      message: "Managed Raz-Kids session is missing",
    });
  });

  it("returns normalized learning events for fetched Raz-Kids activity", async () => {
    fetchRazKidsManagedSessionActivitiesMock.mockResolvedValue([
      {
        occurredAt: "2026-04-22T12:00:00.000Z",
        activityId: "raz-1",
        title: "The Solar System",
        level: "Level H",
        activityType: "quiz_passed",
        quizScorePercent: 90,
        durationSeconds: 1200,
      },
    ]);

    const result = await runRazKidsManagedSessionSync({
      account: {
        id: "acct-1",
        platform: "raz-kids",
        managed_session_payload: {
          activityUrl: "https://www.kidsa-z.com/main/ActivityReport",
          cookies: [{ name: "raz_session", value: "session-token" }],
        },
      },
    });

    expect(result.summary).toEqual({
      fetchedCount: 1,
    });
    expect(result.events).toEqual([
      expect.objectContaining({
        occurredAt: "2026-04-22T12:00:00.000Z",
        title: "The Solar System",
        sourceRef: "raz-1",
        durationMinutes: 20,
      }),
    ]);
  });
});
