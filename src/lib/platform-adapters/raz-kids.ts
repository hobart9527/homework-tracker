export function normalizeRazKidsLearningEvent(input: {
  occurredAt: string;
  activityId?: string | null;
  title: string;
  level?: string | null;
  activityType?: string | null;
  quizScorePercent?: number | null;
  durationSeconds?: number | null;
}) {
  return {
    occurredAt: input.occurredAt,
    eventType: "reading_activity",
    title: input.title.trim(),
    subject: input.level ?? "reading",
    durationMinutes:
      input.durationSeconds && input.durationSeconds > 0
        ? Math.round(input.durationSeconds / 60)
        : null,
    score:
      input.quizScorePercent === null || input.quizScorePercent === undefined
        ? null
        : input.quizScorePercent / 100,
    completionState: input.activityType ?? "completed",
    sourceRef:
      input.activityId ||
      `raz-kids:${input.title}:${input.occurredAt}`,
    rawPayload: {
      activityId: input.activityId ?? null,
      title: input.title,
      level: input.level ?? null,
      activityType: input.activityType ?? null,
      quizScorePercent: input.quizScorePercent ?? null,
      durationSeconds: input.durationSeconds ?? null,
    },
  };
}
