export function normalizeIxlLearningEvent(input: {
  occurredAt: string;
  skillId: string;
  skillName: string;
  subject?: string | null;
  scorePercent?: number | null;
  durationSeconds?: number | null;
  sessionId?: string | null;
}) {
  return {
    occurredAt: input.occurredAt,
    eventType: "skill_practice",
    title: `IXL ${input.skillId} ${input.skillName}`.trim(),
    subject: input.subject ?? null,
    durationMinutes:
      input.durationSeconds && input.durationSeconds > 0
        ? Math.round(input.durationSeconds / 60)
        : null,
    score:
      input.scorePercent === null || input.scorePercent === undefined
        ? null
        : input.scorePercent / 100,
    completionState: "completed",
    sourceRef:
      input.sessionId ||
      `ixl:${input.skillId}:${input.occurredAt}`,
    rawPayload: {
      skillId: input.skillId,
      skillName: input.skillName,
      subject: input.subject ?? null,
      scorePercent: input.scorePercent ?? null,
      durationSeconds: input.durationSeconds ?? null,
      sessionId: input.sessionId ?? null,
    },
  };
}
