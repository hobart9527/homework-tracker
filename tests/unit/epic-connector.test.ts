import { describe, expect, it, vi } from "vitest";
import { runEpicManagedSessionSync } from "@/lib/platform-adapters/epic-connector";

const fetchEpicManagedSessionActivitiesMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/platform-adapters/epic-fetch", async () => {
  const actual = await vi.importActual("@/lib/platform-adapters/epic-fetch");

  return {
    ...actual,
    fetchEpicManagedSessionActivities: fetchEpicManagedSessionActivitiesMock,
  };
});

describe("runEpicManagedSessionSync", () => {
  it("rejects an Epic account without a managed session", async () => {
    await expect(
      runEpicManagedSessionSync({
        account: {
          id: "acct-1",
          platform: "epic",
          managed_session_payload: null,
        },
      })
    ).rejects.toMatchObject({
      name: "EpicManagedSessionError",
      message: "Managed Epic session is missing",
    });
  });

  it("returns normalized learning events for fetched Epic activity", async () => {
    fetchEpicManagedSessionActivitiesMock.mockResolvedValue([
      {
        occurredAt: "2026-04-22T11:00:00.000Z",
        activityId: "epic-1",
        title: "Charlotte's Web",
        category: "fiction",
        status: "finished",
        progressPercent: 100,
        durationSeconds: 1500,
      },
    ]);

    const result = await runEpicManagedSessionSync({
      account: {
        id: "acct-1",
        platform: "epic",
        managed_session_payload: {
          activityUrl: "https://kids.getepic.com/parents/activity",
          cookies: [{ name: "epic_session", value: "session-token" }],
        },
      },
    });

    expect(result.summary).toEqual({
      fetchedCount: 1,
    });
    expect(result.events).toEqual([
      expect.objectContaining({
        occurredAt: "2026-04-22T11:00:00.000Z",
        title: "Charlotte's Web",
        sourceRef: "epic-1",
        durationMinutes: 25,
      }),
    ]);
  });
});
