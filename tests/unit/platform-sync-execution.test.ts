import { describe, expect, it } from "vitest";
import { supportsManagedSessionSync } from "@/lib/platform-sync-execution";

describe("supportsManagedSessionSync", () => {
  it("supports IXL and Khan sessions with cookies only", () => {
    expect(
      supportsManagedSessionSync({
        id: "acct-1",
        child_id: "child-1",
        platform: "ixl",
        managed_session_payload: {
          cookies: [{ name: "PHPSESSID", value: "token" }],
        },
      } as any)
    ).toBe(true);

    expect(
      supportsManagedSessionSync({
        id: "acct-2",
        child_id: "child-1",
        platform: "khan-academy",
        managed_session_payload: {
          cookies: [{ name: "KAAS", value: "token" }],
        },
      } as any)
    ).toBe(true);
  });

  it("requires activityUrl for Epic and Raz-Kids", () => {
    expect(
      supportsManagedSessionSync({
        id: "acct-3",
        child_id: "child-1",
        platform: "epic",
        managed_session_payload: {
          cookies: [{ name: "epic_session", value: "token" }],
        },
      } as any)
    ).toBe(false);

    expect(
      supportsManagedSessionSync({
        id: "acct-4",
        child_id: "child-1",
        platform: "raz-kids",
        managed_session_payload: {
          cookies: [{ name: "raz_session", value: "token" }],
        },
      } as any)
    ).toBe(false);

    expect(
      supportsManagedSessionSync({
        id: "acct-5",
        child_id: "child-1",
        platform: "epic",
        managed_session_payload: {
          activityUrl: "https://kids.getepic.com/parents/activity",
          cookies: [{ name: "epic_session", value: "token" }],
        },
      } as any)
    ).toBe(true);

    expect(
      supportsManagedSessionSync({
        id: "acct-6",
        child_id: "child-1",
        platform: "raz-kids",
        managed_session_payload: {
          activityUrl: "https://www.kidsa-z.com/main/ActivityReport",
          cookies: [{ name: "raz_session", value: "token" }],
        },
      } as any)
    ).toBe(true);
  });
});
