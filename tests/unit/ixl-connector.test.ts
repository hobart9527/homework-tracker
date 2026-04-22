import { describe, expect, it, vi } from "vitest";
import { runIxlManagedSessionSync } from "@/lib/platform-adapters/ixl-connector";

const fetchIxlManagedSessionActivitiesMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/platform-adapters/ixl-fetch", async () => {
  const actual = await vi.importActual("@/lib/platform-adapters/ixl-fetch");

  return {
    ...actual,
    fetchIxlManagedSessionActivities: fetchIxlManagedSessionActivitiesMock,
  };
});

describe("runIxlManagedSessionSync", () => {
  it("rejects an IXL account without a managed session", async () => {
    await expect(
      runIxlManagedSessionSync({
        account: {
          id: "acct-1",
          platform: "ixl",
          managed_session_payload: null,
        },
      })
    ).rejects.toMatchObject({
      name: "IxlManagedSessionError",
      message: "Managed IXL session is missing",
    });
  });

  it("returns normalized learning events for fetched IXL activity", async () => {
    fetchIxlManagedSessionActivitiesMock.mockResolvedValue([
      {
        occurredAt: "2026-04-20T10:00:00.000Z",
        skillId: "A.1",
        skillName: "Add within 10",
        subject: "math",
        scorePercent: 92,
        durationSeconds: 1500,
        sessionId: "session-123",
      },
    ]);

    const result = await runIxlManagedSessionSync({
      account: {
        id: "acct-1",
        platform: "ixl",
        managed_session_payload: {
          cookies: [
            {
              name: "PHPSESSID",
              value: "session-token",
            },
          ],
        },
      },
    });

    expect(result.summary).toEqual({
      fetchedCount: 1,
    });
    expect(result.events).toEqual([
      expect.objectContaining({
        occurredAt: "2026-04-20T10:00:00.000Z",
        title: "Add within 10",
        sourceRef: "session-123",
      }),
    ]);
  });
});
