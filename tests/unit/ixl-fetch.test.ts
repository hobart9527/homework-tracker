import { describe, expect, it, vi } from "vitest";
import {
  IxlManagedSessionError,
  fetchIxlManagedSessionActivities,
  parseIxlActivityResponse,
} from "@/lib/platform-adapters/ixl-fetch";

describe("parseIxlActivityResponse", () => {
  it("extracts activity records from the embedded IXL activity payload", () => {
    const html = `
      <html>
        <body>
          <script id="__IXL_ACTIVITY_DATA__" type="application/json">
            {
              "activities": [
                {
                  "occurredAt": "2026-04-20T10:00:00.000Z",
                  "skillId": "A.1",
                  "skillName": "Add within 10",
                  "subject": "math",
                  "scorePercent": 92,
                  "durationSeconds": 1500,
                  "sessionId": "session-123"
                }
              ]
            }
          </script>
        </body>
      </html>
    `;

    expect(parseIxlActivityResponse(html)).toEqual([
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
  });

  it("parses a window bootstrap payload with nested recentActivities", () => {
    const html = `
      <html>
        <body>
          <script>
            window.__INITIAL_STATE__ = {
              "student":{"id":"student-1"},
              "analytics":{
                "recentActivities":[
                  {
                    "timestamp":"2026-04-20T11:00:00.000Z",
                    "skill":{"id":"B.2","name":"Subtract within 20"},
                    "subject":"math",
                    "score":97,
                    "durationMinutes":30,
                    "sessionId":"session-124"
                  }
                ]
              }
            };
          </script>
        </body>
      </html>
    `;

    expect(parseIxlActivityResponse(html)).toEqual([
      {
        occurredAt: "2026-04-20T11:00:00.000Z",
        skillId: "B.2",
        skillName: "Subtract within 20",
        subject: "math",
        scorePercent: 97,
        durationSeconds: 1800,
        sessionId: "session-124",
      },
    ]);
  });

  it("parses a direct JSON response body with activityItems", () => {
    const body = JSON.stringify({
      activityItems: [
        {
          completedAt: "2026-04-20T12:00:00.000Z",
          skillCode: "C.3",
          title: "Multiply by 2",
          domain: "math",
          smartScore: 88,
          duration: 900,
          id: "session-125",
        },
      ],
    });

    expect(parseIxlActivityResponse(body)).toEqual([
      {
        occurredAt: "2026-04-20T12:00:00.000Z",
        skillId: "C.3",
        skillName: "Multiply by 2",
        subject: "math",
        scorePercent: 88,
        durationSeconds: 900,
        sessionId: "session-125",
      },
    ]);
  });
});

describe("fetchIxlManagedSessionActivities", () => {
  it("rejects missing managed session cookies", async () => {
    await expect(
      fetchIxlManagedSessionActivities({
        managedSessionPayload: null,
        fetchImpl: vi.fn(),
      })
    ).rejects.toMatchObject({
      name: "IxlManagedSessionError",
      message: "Managed IXL session is missing",
    });
  });

  it("detects expired managed sessions from the fetched response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue("<html><title>Sign in to IXL</title></html>"),
    });

    await expect(
      fetchIxlManagedSessionActivities({
        managedSessionPayload: {
          cookies: [
            {
              name: "PHPSESSID",
              value: "session-token",
            },
          ],
        },
        fetchImpl,
      })
    ).rejects.toBeInstanceOf(IxlManagedSessionError);
  });

  it("sends the managed session cookie header and returns parsed activities", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(`
        <script id="__IXL_ACTIVITY_DATA__" type="application/json">
          {
            "activities": [
              {
                "occurredAt": "2026-04-20T10:00:00.000Z",
                "skillId": "A.1",
                "skillName": "Add within 10",
                "subject": "math",
                "scorePercent": 92,
                "durationSeconds": 1500,
                "sessionId": "session-123"
              }
            ]
          }
        </script>
      `),
    });

    const result = await fetchIxlManagedSessionActivities({
      managedSessionPayload: {
        cookies: [
          {
            name: "PHPSESSID",
            value: "session-token",
          },
        ],
      },
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://www.ixl.com/membership/account/activity",
      expect.objectContaining({
        headers: expect.objectContaining({
          cookie: "PHPSESSID=session-token",
        }),
      })
    );
    expect(result).toEqual([
      expect.objectContaining({
        skillId: "A.1",
        skillName: "Add within 10",
      }),
    ]);
  });
});
