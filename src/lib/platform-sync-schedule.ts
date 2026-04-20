import { getDateKeyInTimeZone } from "@/lib/learning-sync";

export const PLATFORM_SYNC_WINDOWS = [
  {
    key: "after-school",
    startHour: 15,
    startMinute: 30,
  },
  {
    key: "evening-review",
    startHour: 20,
    startMinute: 0,
  },
] as const;

export type PlatformSyncWindowKey = (typeof PLATFORM_SYNC_WINDOWS)[number]["key"];

export function isPlatformSyncWindowKey(
  value: string
): value is PlatformSyncWindowKey {
  return PLATFORM_SYNC_WINDOWS.some((window) => window.key === value);
}

export function resolvePlatformSyncWindow(input: {
  now: Date;
  timeZone: string;
}): PlatformSyncWindowKey {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: input.timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(input.now);

  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? "0"
  );
  const minutesOfDay = hour * 60 + minute;

  if (minutesOfDay >= 20 * 60) {
    return "evening-review";
  }

  return "after-school";
}

export function buildPlatformSyncWindowKey(input: {
  now: Date;
  timeZone: string;
  scheduleWindow: PlatformSyncWindowKey;
}) {
  return `${getDateKeyInTimeZone(
    input.now.toISOString(),
    input.timeZone
  )}:${input.scheduleWindow}`;
}
