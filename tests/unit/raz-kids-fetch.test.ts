import { describe, expect, it, vi } from "vitest";
import {
  fetchRazKidsManagedSessionActivities,
  parseRazKidsActivityResponse,
  RazKidsManagedSessionError,
} from "@/lib/platform-adapters/raz-kids-fetch";

describe("parseRazKidsActivityResponse", () => {
  it("extracts activity report items from a fixed script payload", () => {
    const html = `
      <script id="__RAZ_ACTIVITY_DATA__" type="application/json">
        {
          "activityReport": [
            {
              "occurredAt": "2026-04-22T12:00:00.000Z",
              "activityId": "raz-1",
              "resourceTitle": "The Solar System",
              "readingLevel": "Level H",
              "activityType": "quiz_passed",
              "quizScorePercent": 90,
              "durationSeconds": 1200
            }
          ]
        }
      </script>
    `;

    expect(parseRazKidsActivityResponse(html)).toEqual([
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
  });
});

describe("fetchRazKidsManagedSessionActivities", () => {
  it("rejects missing managed session cookies", async () => {
    await expect(
      fetchRazKidsManagedSessionActivities({
        managedSessionPayload: null,
        fetchImpl: vi.fn(),
      })
    ).rejects.toMatchObject({
      name: "RazKidsManagedSessionError",
      message: "Managed Raz-Kids session is missing",
    });
  });

  it("rejects missing activity URL", async () => {
    await expect(
      fetchRazKidsManagedSessionActivities({
        managedSessionPayload: {
          cookies: [{ name: "raz_session", value: "session-token" }],
        },
        fetchImpl: vi.fn(),
      })
    ).rejects.toMatchObject({
      name: "RazKidsManagedSessionError",
      message: "Managed Raz-Kids session is missing activity URL",
    });
  });

  it("detects expired managed sessions from the fetched response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue("<html><title>Kids Login</title></html>"),
    });

    await expect(
      fetchRazKidsManagedSessionActivities({
        managedSessionPayload: {
          activityUrl: "https://www.kidsa-z.com/main/ActivityReport",
          cookies: [{ name: "raz_session", value: "session-token" }],
        },
        fetchImpl,
      })
    ).rejects.toBeInstanceOf(RazKidsManagedSessionError);
  });

  it("sends the managed session cookie header and returns parsed activities", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(`
        <script id="__RAZ_ACTIVITY_DATA__" type="application/json">
          {
            "activityReport": [
              {
                "occurredAt": "2026-04-22T12:00:00.000Z",
                "activityId": "raz-1",
                "resourceTitle": "The Solar System",
                "readingLevel": "Level H",
                "activityType": "quiz_passed",
                "quizScorePercent": 90,
                "durationSeconds": 1200
              }
            ]
          }
        </script>
      `),
    });

    const result = await fetchRazKidsManagedSessionActivities({
      managedSessionPayload: {
        activityUrl: "https://www.kidsa-z.com/main/ActivityReport",
        cookies: [{ name: "raz_session", value: "session-token" }],
      },
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://www.kidsa-z.com/main/ActivityReport",
      expect.objectContaining({
        headers: expect.objectContaining({
          cookie: "raz_session=session-token",
        }),
      })
    );
    expect(result).toEqual([
      expect.objectContaining({
        activityId: "raz-1",
        title: "The Solar System",
      }),
    ]);
  });
});
