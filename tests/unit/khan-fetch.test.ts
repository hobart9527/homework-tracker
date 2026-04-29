import { describe, expect, it, vi } from "vitest";
import {
  fetchKhanManagedSessionActivities,
  KhanManagedSessionError,
  parseKhanActivityResponse,
} from "@/lib/platform-adapters/khan-fetch";

describe("parseKhanActivityResponse", () => {
  it("extracts activity items from a fixed script payload", () => {
    const html = `
      <script id="__KHAN_ACTIVITY_DATA__" type="application/json">
        {
          "activityItems": [
            {
              "occurredAt": "2026-04-20T11:00:00.000Z",
              "lessonId": "lesson-123",
              "lessonTitle": "Fractions basics",
              "courseName": "Math 3",
              "masteryLevel": "practiced",
              "progressPercent": 88,
              "durationSeconds": 1800
            }
          ]
        }
      </script>
    `;

    expect(parseKhanActivityResponse(html)).toEqual([
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
  });

  it("parses a bootstrap state payload with nested activity log entries", () => {
    const html = `
      <script>
        window.__APOLLO_STATE__ = {
          "progressPage": {
            "activityLog": [
              {
                "timestamp": "2026-04-20T12:00:00.000Z",
                "contentId": "lesson-456",
                "title": "Reading comprehension",
                "course": "ELA 2",
                "state": "completed",
                "progress": 100,
                "timeSpentMinutes": 20
              }
            ]
          }
        };
      </script>
    `;

    expect(parseKhanActivityResponse(html)).toEqual([
      {
        occurredAt: "2026-04-20T12:00:00.000Z",
        lessonId: "lesson-456",
        lessonTitle: "Reading comprehension",
        courseName: "ELA 2",
        masteryLevel: "completed",
        progressPercent: 100,
        durationSeconds: 1200,
      },
    ]);
  });
});

describe("fetchKhanManagedSessionActivities", () => {
  it("rejects missing managed session cookies", async () => {
    await expect(
      fetchKhanManagedSessionActivities({
        managedSessionPayload: null,
        fetchImpl: vi.fn(),
      })
    ).rejects.toMatchObject({
      name: "KhanManagedSessionError",
      message: "Managed Khan session is missing",
    });
  });

  it("detects expired managed sessions from the fetched response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue("<html><title>Log in | Khan Academy</title></html>"),
    });

    await expect(
      fetchKhanManagedSessionActivities({
        managedSessionPayload: {
          cookies: [{ name: "KAAS", value: "session-token" }],
        },
        fetchImpl,
      })
    ).rejects.toBeInstanceOf(KhanManagedSessionError);
  });

  it("sends the managed session cookie header and returns parsed activities", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(`
        <script id="__KHAN_ACTIVITY_DATA__" type="application/json">
          {
            "activityItems": [
              {
                "occurredAt": "2026-04-20T11:00:00.000Z",
                "lessonId": "lesson-123",
                "lessonTitle": "Fractions basics",
                "courseName": "Math 3",
                "masteryLevel": "practiced",
                "progressPercent": 88,
                "durationSeconds": 1800
              }
            ]
          }
        </script>
      `),
    });

    const result = await fetchKhanManagedSessionActivities({
      managedSessionPayload: {
        cookies: [{ name: "KAAS", value: "session-token" }],
      },
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://www.khanacademy.org/progress",
      expect.objectContaining({
        headers: expect.objectContaining({
          cookie: "KAAS=session-token",
        }),
      })
    );
    expect(result).toEqual([
      expect.objectContaining({
        lessonId: "lesson-123",
        lessonTitle: "Fractions basics",
      }),
    ]);
  });
});
