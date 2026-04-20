export type LearningPlatform = "ixl" | "khan" | "raz" | "epic" | string;

export type AutoCheckinDecision =
  | "auto_completed"
  | "partially_completed"
  | "unmatched";

const HOMEWORK_TYPE_ALIASES: Record<string, string[]> = {
  math: ["math", "mathematics", "数学", "算术", "algebra", "geometry"],
  reading: ["reading", "read", "阅读", "朗读", "phonics", "literacy"],
  english: ["english", "英语", "ela", "languagearts", "language art"],
  science: ["science", "科学"],
};

function normalizeMatchText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

export function buildLearningEventDedupKey(input: {
  childId: string;
  platform: LearningPlatform;
  platformAccountId: string;
  sourceRef: string;
}) {
  return [
    input.childId,
    input.platform,
    input.platformAccountId,
    input.sourceRef,
  ].join(":");
}

export function getDateKeyInTimeZone(
  occurredAt: string,
  timeZone: string
) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(new Date(occurredAt));
}

export function selectPrimaryHomeworkMatch<
  T extends {
    matchedAt: string;
  },
>(matches: T[]): T | null {
  if (matches.length === 0) {
    return null;
  }

  return [...matches].sort((left, right) => {
    return (
      new Date(left.matchedAt).getTime() - new Date(right.matchedAt).getTime()
    );
  })[0];
}

export function matchesPlatformHomeworkType(input: {
  platform: LearningPlatform;
  subject: string | null;
  title: string;
  homeworkTypeName: string | null | undefined;
}) {
  if (!input.homeworkTypeName?.trim()) {
    return true;
  }

  const normalizedTypeName = normalizeMatchText(input.homeworkTypeName);
  const normalizedSubject = input.subject
    ? normalizeMatchText(input.subject)
    : "";
  const normalizedTitle = normalizeMatchText(input.title);
  const haystack = [normalizedSubject, normalizedTitle].filter(Boolean);

  if (haystack.length === 0) {
    return true;
  }

  const aliasEntry = Object.entries(HOMEWORK_TYPE_ALIASES).find(
    ([category, aliases]) =>
      normalizedTypeName.includes(category) ||
      aliases.some((alias) => normalizedTypeName.includes(normalizeMatchText(alias)))
  );

  if (!aliasEntry) {
    return haystack.some((value) => value.includes(normalizedTypeName));
  }

  const [, aliases] = aliasEntry;
  const normalizedAliases = aliases.map(normalizeMatchText);

  return haystack.some((value) =>
    normalizedAliases.some((alias) => value.includes(alias))
  );
}

export function matchesDirectPlatformBinding(input: {
  eventPlatform: LearningPlatform;
  eventSourceRef: string;
  homeworkBindingPlatform: string | null | undefined;
  homeworkBindingSourceRef: string | null | undefined;
}) {
  if (!input.homeworkBindingPlatform && !input.homeworkBindingSourceRef) {
    return false;
  }

  return (
    input.homeworkBindingPlatform === input.eventPlatform &&
    input.homeworkBindingSourceRef === input.eventSourceRef
  );
}

export function resolveAutoCheckinDecision(input: {
  requiredMinutes: number | null;
  requiredCheckpointType: "photo" | "audio" | null;
  durationMinutes: number | null;
  completionState?: string | null;
}): AutoCheckinDecision {
  const durationMinutes = input.durationMinutes ?? 0;
  const requiredMinutes = input.requiredMinutes ?? 0;
  const normalizedCompletionState = input.completionState?.trim().toLowerCase() ?? null;
  const hasCompletionStateEvidence =
    normalizedCompletionState === "completed" ||
    normalizedCompletionState === "mastered" ||
    normalizedCompletionState === "practiced" ||
    normalizedCompletionState === "proficient";
  const meetsDurationThreshold =
    Number.isFinite(durationMinutes) &&
    durationMinutes > 0 &&
    durationMinutes >= requiredMinutes;
  const meetsCompletionStateThreshold =
    hasCompletionStateEvidence && requiredMinutes <= 0;

  if (!meetsDurationThreshold && !meetsCompletionStateThreshold) {
    return "unmatched";
  }

  if (input.requiredCheckpointType) {
    return "partially_completed";
  }

  return "auto_completed";
}
