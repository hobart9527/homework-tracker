export type IxlManagedSessionPayload = {
  cookies?: Array<{
    name: string;
    value: string;
  }>;
  headers?: Record<string, string>;
  activityUrl?: string | null;
};

export type IxlFetchedActivity = {
  occurredAt: string;
  skillId: string;
  skillName: string;
  subject: string | null;
  scorePercent: number | null;
  durationSeconds: number | null;
  sessionId: string | null;
};

const IXL_SUBJECTS = [
  { queryValue: "0", label: "math" },
  { queryValue: "1", label: "ela" },
] as const;

export class IxlManagedSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IxlManagedSessionError";
  }
}

function tryParseJson(value: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function findActivityArray(value: unknown): Array<Record<string, unknown>> | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    const objectItems = value.filter(
      (item): item is Record<string, unknown> =>
        !!item && typeof item === "object" && !Array.isArray(item)
    );

    return objectItems.length ? objectItems : null;
  }

  const record = value as Record<string, unknown>;
  const candidateKeys = [
    "activities",
    "recentActivities",
    "activityItems",
    "items",
    "sessions",
  ];

  for (const key of candidateKeys) {
    const candidate = findActivityArray(record[key]);

    if (candidate) {
      return candidate;
    }
  }

  for (const nestedValue of Object.values(record)) {
    const candidate = findActivityArray(nestedValue);

    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function extractBootstrapJson(html: string) {
  const fixedScriptMatch = html.match(
    /<script[^>]*id=["']__IXL_ACTIVITY_DATA__["'][^>]*>([\s\S]*?)<\/script>/i
  );

  if (fixedScriptMatch?.[1]) {
    return fixedScriptMatch[1].trim();
  }

  const bootstrapMatch = html.match(
    /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})\s*;/i
  );

  if (bootstrapMatch?.[1]) {
    return bootstrapMatch[1].trim();
  }

  return html.trim();
}

function toFetchedActivity(activity: Record<string, unknown>): IxlFetchedActivity {
  const nestedSkill =
    activity.skill && typeof activity.skill === "object" && !Array.isArray(activity.skill)
      ? (activity.skill as Record<string, unknown>)
      : null;
  const durationMinutes =
    typeof activity.durationMinutes === "number" ? activity.durationMinutes : null;

  return {
    occurredAt: String(
      activity.occurredAt ??
        activity.timestamp ??
        activity.completedAt ??
        activity.date
    ),
    skillId: String(
      activity.skillId ??
        activity.skillCode ??
        nestedSkill?.id ??
        activity.code
    ),
    skillName: String(
      activity.skillName ??
        activity.title ??
        nestedSkill?.name ??
        activity.name
    ),
    subject: String(
      activity.subject ??
        activity.domain ??
        activity.course ??
        ""
    ) || null,
    scorePercent:
      typeof activity.scorePercent === "number"
        ? activity.scorePercent
        : typeof activity.score === "number"
          ? activity.score
          : typeof activity.smartScore === "number"
            ? activity.smartScore
            : null,
    durationSeconds:
      typeof activity.durationSeconds === "number"
        ? activity.durationSeconds
        : typeof activity.duration === "number"
          ? activity.duration
          : durationMinutes !== null
            ? durationMinutes * 60
            : null,
    sessionId:
      typeof activity.sessionId === "string"
        ? activity.sessionId
        : typeof activity.id === "string"
          ? activity.id
          : null,
  };
}

function parseStudentUsageRunResponse(value: unknown): IxlFetchedActivity[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const report = value as Record<string, unknown>;
  if (!Array.isArray(report.table)) {
    return null;
  }

  const activities: IxlFetchedActivity[] = [];

  for (const session of report.table) {
    if (!session || typeof session !== "object" || Array.isArray(session)) {
      continue;
    }

    const sessionRecord = session as Record<string, unknown>;
    const occurredAt =
      typeof sessionRecord.sessionStartLocalDateStr === "string"
        ? `${sessionRecord.sessionStartLocalDateStr}T00:00:00`
        : typeof sessionRecord.sessionEndLocalDateStr === "string"
          ? `${sessionRecord.sessionEndLocalDateStr}T00:00:00`
          : null;
    const practiceSession =
      typeof sessionRecord.practiceSession === "string"
        ? sessionRecord.practiceSession
        : null;
    const skills = Array.isArray(sessionRecord.skills)
      ? sessionRecord.skills
      : [];

    for (const skill of skills) {
      if (!skill || typeof skill !== "object" || Array.isArray(skill) || !occurredAt) {
        continue;
      }

      const skillRecord = skill as Record<string, unknown>;
      const skillId =
        typeof skillRecord.skillCode === "string"
          ? skillRecord.skillCode
          : typeof skillRecord.permacode === "string"
            ? skillRecord.permacode
            : typeof skillRecord.skill === "string"
              ? skillRecord.skill
              : null;
      const skillName =
        typeof skillRecord.skillName === "string" ? skillRecord.skillName : null;

      if (!skillId || !skillName) {
        continue;
      }

      activities.push({
        occurredAt,
        skillId,
        skillName,
        subject: null,
        scorePercent:
          typeof skillRecord.score === "number" ? skillRecord.score : null,
        durationSeconds:
          typeof skillRecord.secondsSpent === "number"
            ? skillRecord.secondsSpent
            : null,
        sessionId:
          practiceSession || skillId
            ? `${practiceSession ?? "session"}:${skillId}`
            : null,
      });
    }
  }

  return activities;
}

function buildIxlUsageRunUrl(
  activityUrl: string | null | undefined,
  subjectQueryValue: string
) {
  const url = new URL(
    activityUrl ?? "https://www.ixl.com/analytics/student-usage/run"
  );
  url.searchParams.set("subjects", subjectQueryValue);
  return url.toString();
}

function aggregateIxlActivities(
  activities: IxlFetchedActivity[]
): IxlFetchedActivity[] {
  const aggregated = new Map<string, IxlFetchedActivity>();

  for (const activity of activities) {
    const key = [
      activity.occurredAt.slice(0, 10),
      activity.subject ?? "",
      activity.skillId,
      activity.skillName,
    ].join("::");
    const existing = aggregated.get(key);

    if (!existing) {
      aggregated.set(key, activity);
      continue;
    }

    aggregated.set(key, {
      ...existing,
      durationSeconds:
        (existing.durationSeconds ?? 0) + (activity.durationSeconds ?? 0),
      scorePercent: activity.scorePercent ?? existing.scorePercent ?? null,
    });
  }

  return Array.from(aggregated.values()).sort((left, right) =>
    right.occurredAt.localeCompare(left.occurredAt)
  );
}

function buildCookieHeader(
  cookies: IxlManagedSessionPayload["cookies"] | null | undefined
) {
  if (!cookies?.length) {
    return null;
  }

  return cookies
    .filter(
      (cookie) =>
        typeof cookie?.name === "string" &&
        cookie.name.length > 0 &&
        typeof cookie?.value === "string"
    )
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

function isIxlLoginPage(html: string) {
  return (
    /<title>\s*(sign in to ixl|log in to ixl|signin)\s*<\/title>/i.test(html) ||
    /<form[^>]+action=["'][^"']*\/signin/i.test(html) ||
    /<input[^>]+type=["']password["']/i.test(html)
  );
}

export function parseIxlActivityResponse(html: string): IxlFetchedActivity[] {
  const extractedPayload = extractBootstrapJson(html);
  const parsed = tryParseJson(extractedPayload);
  const studentUsageActivities = parseStudentUsageRunResponse(parsed);

  if (studentUsageActivities) {
    return studentUsageActivities;
  }

  const activities = findActivityArray(parsed);

  if (!activities) {
    throw new Error("Unable to parse IXL activity payload");
  }

  return activities.map(toFetchedActivity);
}

export async function fetchIxlManagedSessionActivities(input: {
  managedSessionPayload: IxlManagedSessionPayload | null | undefined;
  fetchImpl?: typeof fetch;
}) {
  const cookieHeader = buildCookieHeader(input.managedSessionPayload?.cookies);

  if (!cookieHeader) {
    throw new IxlManagedSessionError("Managed IXL session is missing");
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const activities: IxlFetchedActivity[] = [];

  for (const subject of IXL_SUBJECTS) {
    const response = await fetchImpl(
      buildIxlUsageRunUrl(
        input.managedSessionPayload?.activityUrl,
        subject.queryValue
      ),
      {
        headers: {
          cookie: cookieHeader,
          ...(input.managedSessionPayload?.headers ?? {}),
        },
      }
    );

    const body = await response.text();

    if (response.status === 401 || isIxlLoginPage(body)) {
      throw new IxlManagedSessionError("Managed IXL session expired");
    }

    if (response.status === 404) {
      throw new Error("IXL usage details page was not found");
    }

    const subjectActivities = parseIxlActivityResponse(body).map((activity) => ({
      ...activity,
      subject: subject.label,
    }));

    activities.push(...subjectActivities);
  }

  return aggregateIxlActivities(activities);
}
