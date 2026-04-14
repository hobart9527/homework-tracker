import type { Database } from "@/lib/supabase/types";
import { isAfterCutoff } from "@/lib/homework-utils";
import type { ProofType } from "@/lib/tasks/daily-task";

type Homework = Database["public"]["Tables"]["homeworks"]["Row"];
type CheckIn = Database["public"]["Tables"]["check_ins"]["Row"];

export type CheckInSubmissionResult = {
  success: true;
  completed: true;
  late: boolean;
  scored: boolean;
  awardedPoints: number;
  message: string;
};

const PROOF_TYPES: Exclude<ProofType, null>[] = ["photo", "audio"];
const CHECK_IN_SCORING_COLUMNS = [
  "submitted_at",
  "awarded_points",
  "is_scored",
  "is_late",
  "proof_type",
] as const;

export function isProofType(value: unknown): value is Exclude<ProofType, null> {
  return typeof value === "string" && PROOF_TYPES.includes(value as Exclude<ProofType, null>);
}

export function isMissingCheckInScoringColumnError(message: string) {
  const normalizedMessage = message.toLowerCase();

  const hasSchemaCacheMissingColumnText =
    normalizedMessage.includes("schema cache") &&
    (normalizedMessage.includes("could not find") ||
      normalizedMessage.includes("missing column") ||
      normalizedMessage.includes("missing the column"));

  return (
    hasSchemaCacheMissingColumnText &&
    CHECK_IN_SCORING_COLUMNS.some((column) =>
      normalizedMessage.includes(column)
    )
  );
}

export function getProofLabel(proofType: Exclude<ProofType, null>) {
  if (proofType === "photo") {
    return "照片";
  }

  return "录音";
}

export function buildCheckInInsertPayload(input: {
  homeworkId: string;
  childId: string;
  completedAt: string;
  note?: string | null;
  proofType: ProofType;
  result: CheckInSubmissionResult;
}) {
  return {
    homework_id: input.homeworkId,
    child_id: input.childId,
    completed_at: input.completedAt,
    submitted_at: input.completedAt,
    points_earned: input.result.awardedPoints,
    awarded_points: input.result.awardedPoints,
    is_scored: input.result.scored,
    is_late: input.result.late,
    proof_type: input.proofType,
    note: input.note || null,
  };
}

export function buildLegacyCheckInInsertPayload(input: {
  homeworkId: string;
  childId: string;
  completedAt: string;
  note?: string | null;
  result: CheckInSubmissionResult;
}) {
  return {
    homework_id: input.homeworkId,
    child_id: input.childId,
    completed_at: input.completedAt,
    points_earned: input.result.awardedPoints,
    note: input.note || null,
  };
}

export function normalizeLegacyCheckInRecord(input: {
  checkIn: Record<string, unknown>;
  result: CheckInSubmissionResult;
}) {
  return {
    ...input.checkIn,
    submitted_at:
      (input.checkIn.submitted_at as string | null | undefined) ??
      (input.checkIn.completed_at as string | null | undefined) ??
      null,
    awarded_points:
      (input.checkIn.awarded_points as number | null | undefined) ??
      input.result.awardedPoints,
    is_scored:
      (input.checkIn.is_scored as boolean | null | undefined) ?? input.result.scored,
    is_late:
      (input.checkIn.is_late as boolean | null | undefined) ?? input.result.late,
    proof_type:
      (input.checkIn.proof_type as ProofType | undefined) ?? null,
  };
}

export function buildSubmissionDecision(input: {
  homework: Homework;
  existingSameDay: CheckIn[];
  proofType: ProofType;
  now: Date;
}): CheckInSubmissionResult {
  const proofRequired = input.homework.required_checkpoint_type;

  if (proofRequired && proofRequired !== input.proofType) {
    throw new Error(`本次作业需要提交${getProofLabel(proofRequired)}`);
  }

  const firstCompletion = input.existingSameDay.some(
    (checkIn) =>
      checkIn.is_scored === true ||
      (checkIn.awarded_points ?? 0) > 0 ||
      (checkIn.points_earned ?? 0) > 0
  );
  const late = isAfterCutoff(input.homework.daily_cutoff_time, input.now);
  const awardedPoints = firstCompletion ? 0 : input.homework.point_value ?? 0;

  return {
    success: true,
    completed: true,
    late,
    scored: !firstCompletion,
    awardedPoints,
    message: firstCompletion
      ? "本次记录已保存，今天不重复加分"
      : `完成成功，获得 ${awardedPoints} 积分`,
  };
}
