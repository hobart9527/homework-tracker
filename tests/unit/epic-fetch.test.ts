import { describe, expect, it, vi } from "vitest";
import {
  EpicManagedSessionError,
  fetchEpicManagedSessionActivities,
  parseEpicActivityResponse,
} from "@/lib/platform-adapters/epic-fetch";

describe("parseEpicActivityResponse", () => {
  it("extracts reading log items from a fixed script payload", () => {
    const html = `
      <script id="__EPIC_ACTIVITY_DATA__" type="application/json">
        {
          "readingLog": [
            {
              "occurredAt": "2026-04-22T11:00:00.000Z",
              "activityId": "epic-1",
              "bookTitle": "Charlotte's Web",
              "category": "fiction",
              "status": "finished",
              "progressPercent": 100,
              "durationSeconds": 1500
            }
          ]
        }
      </script>
    `;

    expect(parseEpicActivityResponse(html)).toEqual([
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
  });
});

describe("fetchEpicManagedSessionActivities", () => {
  it("rejects missing managed session cookies", async () => {
    await expect(
      fetchEpicManagedSessionActivities({
        managedSessionPayload: null,
        fetchImpl: vi.fn(),
      })
    ).rejects.toMatchObject({
      name: "EpicManagedSessionError",
      message: "Managed Epic session is missing",
    });
  });

  it("rejects missing activity URL", async () => {
    await expect(
      fetchEpicManagedSessionActivities({
        managedSessionPayload: {
          cookies: [{ name: "epic_session", value: "session-token" }],
        },
        fetchImpl: vi.fn(),
      })
    ).rejects.toMatchObject({
      name: "EpicManagedSessionError",
      message: "Managed Epic session is missing activity URL",
    });
  });

  it("detects expired managed sessions from the fetched response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue("<html><title>Parent Login</title></html>"),
    });

    await expect(
      fetchEpicManagedSessionActivities({
        managedSessionPayload: {
          activityUrl: "https://kids.getepic.com/parents/activity",
          cookies: [{ name: "epic_session", value: "session-token" }],
        },
        fetchImpl,
      })
    ).rejects.toBeInstanceOf(EpicManagedSessionError);
  });

  it("sends the managed session cookie header and returns parsed activities", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(`
        <script id="__EPIC_ACTIVITY_DATA__" type="application/json">
          {
            "readingLog": [
              {
                "occurredAt": "2026-04-22T11:00:00.000Z",
                "activityId": "epic-1",
                "bookTitle": "Charlotte's Web",
                "category": "fiction",
                "status": "finished",
                "progressPercent": 100,
                "durationSeconds": 1500
              }
            ]
          }
        </script>
      `),
    });

    const result = await fetchEpicManagedSessionActivities({
      managedSessionPayload: {
        activityUrl: "https://kids.getepic.com/parents/activity",
        cookies: [{ name: "epic_session", value: "session-token" }],
      },
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://kids.getepic.com/parents/activity",
      expect.objectContaining({
        headers: expect.objectContaining({
          cookie: "epic_session=session-token",
        }),
      })
    );
    expect(result).toEqual([
      expect.objectContaining({
        activityId: "epic-1",
        title: "Charlotte's Web",
      }),
    ]);
  });
});
