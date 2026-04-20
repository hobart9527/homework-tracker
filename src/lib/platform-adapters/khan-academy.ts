export function normalizeKhanLearningEvent(input: {
  occurredAt: string;
  lessonId?: string | null;
  lessonTitle: string;
  courseName?: string | null;
  masteryLevel?: string | null;
  progressPercent?: number | null;
  durationSeconds?: number | null;
}) {
  return {
    occurredAt: input.occurredAt,
    eventType: "lesson_completed",
    title: `Khan Academy ${input.lessonTitle}`.trim(),
    subject: input.courseName ?? null,
    durationMinutes:
      input.durationSeconds && input.durationSeconds > 0
        ? Math.round(input.durationSeconds / 60)
        : null,
    score:
      input.progressPercent === null || input.progressPercent === undefined
        ? null
        : input.progressPercent / 100,
    completionState: input.masteryLevel ?? "completed",
    sourceRef:
      input.lessonId ||
      `khan:${input.lessonTitle}:${input.occurredAt}`,
    rawPayload: {
      lessonId: input.lessonId ?? null,
      lessonTitle: input.lessonTitle,
      courseName: input.courseName ?? null,
      masteryLevel: input.masteryLevel ?? null,
      progressPercent: input.progressPercent ?? null,
      durationSeconds: input.durationSeconds ?? null,
    },
  };
}
