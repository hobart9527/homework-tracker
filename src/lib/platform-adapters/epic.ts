export function normalizeEpicLearningEvent(input: {
  occurredAt: string;
  activityId?: string | null;
  title: string;
  category?: string | null;
  status?: string | null;
  progressPercent?: number | null;
  durationSeconds?: number | null;
}) {
  return {
    occurredAt: input.occurredAt,
    eventType: "reading_session",
    title: input.title.trim(),
    subject: input.category ?? "reading",
    durationMinutes:
      input.durationSeconds && input.durationSeconds > 0
        ? Math.round(input.durationSeconds / 60)
        : null,
    score:
      input.progressPercent === null || input.progressPercent === undefined
        ? null
        : input.progressPercent / 100,
    completionState: input.status ?? "completed",
    sourceRef:
      input.activityId ||
      `epic:${input.title}:${input.occurredAt}`,
    rawPayload: {
      activityId: input.activityId ?? null,
      title: input.title,
      category: input.category ?? null,
      status: input.status ?? null,
      progressPercent: input.progressPercent ?? null,
      durationSeconds: input.durationSeconds ?? null,
    },
  };
}
