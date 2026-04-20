import { describe, expect, it, vi } from "vitest";
import { runKhanManagedSessionSync } from "@/lib/platform-adapters/khan-connector";

const fetchKhanManagedSessionActivitiesMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/platform-adapters/khan-fetch", async () => {
  const actual = await vi.importActual("@/lib/platform-adapters/khan-fetch");

  return {
    ...actual,
    fetchKhanManagedSessionActivities: fetchKhanManagedSessionActivitiesMock,
  };
});

describe("runKhanManagedSessionSync", () => {
  it("rejects a Khan account without a managed session", async () => {
    await expect(
      runKhanManagedSessionSync({
        account: {
          id: "acct-1",
          platform: "khan-academy",
          managed_session_payload: null,
        },
      })
    ).rejects.toMatchObject({
      name: "KhanManagedSessionError",
      message: "Managed Khan session is missing",
    });
  });

  it("returns normalized learning events for fetched Khan activity", async () => {
    fetchKhanManagedSessionActivitiesMock.mockResolvedValue([
      {
        occurredAt: "2026-04-20T11:00:00.000Z",
        lessonId: "lesson-123",
        lessonTitle: "Fractions basics",
        courseName: "Math 3",
        masteryLevel: "practiced",
        progressPercent: 88,
        durationSeconds: 1800,
      },
    ]);

    const result = await runKhanManagedSessionSync({
      account: {
        id: "acct-1",
        platform: "khan-academy",
        managed_session_payload: {
          cookies: [{ name: "KAAS", value: "session-token" }],
        },
      },
    });

    expect(result.summary).toEqual({
      fetchedCount: 1,
    });
    expect(result.events).toEqual([
      expect.objectContaining({
        occurredAt: "2026-04-20T11:00:00.000Z",
        title: "Khan Academy Fractions basics",
        sourceRef: "lesson-123",
      }),
    ]);
  });
});
