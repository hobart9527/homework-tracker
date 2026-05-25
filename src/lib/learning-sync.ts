export type LearningPlatform = "ixl" | "khan-academy" | "raz-kids" | "epic" | string;

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

const GROUP_PLATFORM_HINTS: Record<string, string[]> = {
  "数学": ["ixl", "khan-academy"],
  "英文": ["raz-kids", "epic", "ixl"],
  "中文": ["raz-kids", "epic"],
  "兴趣": [],
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
  homeworkGroupName?: string | null | undefined;
  homeworkTypeId?: string | null | undefined;
  subjectMappings?: Array<{ platform: string; platform_subject: string; type_id: string; confidence: number }> | null;
  typeBinding?: { match_keywords: string[] } | null;
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

  // Stage 1 (L1): platform_subject_mappings exact match
  if (input.subjectMappings && input.homeworkTypeId) {
    const exactMatch = input.subjectMappings.find(
      (m) =>
        m.platform === input.platform &&
        m.platform_subject.toLowerCase() === normalizeMatchText(input.subject || "") &&
        m.type_id === input.homeworkTypeId
    );
    if (exactMatch) return true;
  }

  // Stage 2 (L2): match_keywords from homework_type_bindings
  if (input.typeBinding?.match_keywords?.length) {
    const normalizedKeywords = input.typeBinding.match_keywords.map(normalizeMatchText);
    if (haystack.some((value) => normalizedKeywords.some((k) => value.includes(k)))) {
      return true;
    }
  }

  // Stage 3 (L3): existing fallback logic
  const aliasEntry = Object.entries(HOMEWORK_TYPE_ALIASES).find(
    ([category, aliases]) =>
      normalizedTypeName.includes(category) ||
      aliases.some((alias) => normalizedTypeName.includes(normalizeMatchText(alias)))
  );

  if (aliasEntry) {
    const [, aliases] = aliasEntry;
    const normalizedAliases = aliases.map(normalizeMatchText);

    return haystack.some((value) =>
      normalizedAliases.some((alias) => value.includes(alias))
    );
  }

  if (input.homeworkGroupName?.trim()) {
    const normalizedGroupName = normalizeMatchText(input.homeworkGroupName);
    const hintedPlatforms = GROUP_PLATFORM_HINTS[input.homeworkGroupName.trim()];
    if (hintedPlatforms && hintedPlatforms.includes(input.platform)) {
      return true;
    }

    const fallbackAliases = Object.entries(HOMEWORK_TYPE_ALIASES).find(
      ([category, aliases]) =>
        normalizedGroupName.includes(category) ||
        aliases.some((alias) => normalizedGroupName.includes(normalizeMatchText(alias)))
    );

    if (fallbackAliases) {
      const [, aliases] = fallbackAliases;
      const normalizedAliases = aliases.map(normalizeMatchText);
      return haystack.some((value) =>
        normalizedAliases.some((alias) => value.includes(alias))
      );
    }
  }

  return haystack.some((value) => value.includes(normalizedTypeName));
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

export function matchesTypePlatformBinding(input: {
  eventPlatform: string;
  homeworkTypeId: string | null | undefined;
  homeworkTypeBinding: { allowed_platforms: string[] } | null | undefined;
}): boolean {
  if (!input.homeworkTypeBinding) return true; // no binding config = allow all
  if (input.homeworkTypeBinding.allowed_platforms.length === 0) return false; // explicitly empty = none allowed
  return input.homeworkTypeBinding.allowed_platforms.includes(input.eventPlatform);
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
