import { createClient } from "@/lib/supabase/server";
import {
  buildSubmissionDecision,
  isMissingCheckInScoringColumnError,
  isProofType,
} from "@/lib/tasks/check-in-submission";
import type { ProofType } from "@/lib/tasks/daily-task";
import { getLocalDayBounds } from "@/lib/homework-utils";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json();
  const homework_id = payload.homework_id || payload.homeworkId;
  const note = payload.note;
  const proofType = payload.proofType;

  if (!homework_id) {
    return NextResponse.json({ error: "Missing homework_id" }, { status: 400 });
  }

  if (proofType !== null && proofType !== undefined && !isProofType(proofType)) {
    return NextResponse.json({ error: "Invalid proof type" }, { status: 400 });
  }

  const { data: homework, error: homeworkError } = await supabase
    .from("homeworks")
    .select("*")
    .eq("id", homework_id)
    .eq("child_id", session.user.id)
    .single();

  if (homeworkError || !homework) {
    return NextResponse.json({ error: "Homework not found" }, { status: 404 });
  }

  const now = new Date();
  const { start: dayStart, end: dayEnd } = getLocalDayBounds(now);

  const { data: existingSameDay, error: existingError } = await supabase
    .from("check_ins")
    .select("*")
    .eq("child_id", session.user.id)
    .eq("homework_id", homework.id)
    .gte("completed_at", dayStart)
    .lte("completed_at", dayEnd);

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  let decision;
  try {
    decision = buildSubmissionDecision({
      homework,
      existingSameDay: existingSameDay || [],
      proofType: (proofType ?? null) as ProofType,
      now,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid submission";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { data: checkIn, error: insertError } = await supabase
    .from("check_ins")
    .insert({
      homework_id: homework.id,
      child_id: session.user.id,
      completed_at: now.toISOString(),
      submitted_at: now.toISOString(),
      points_earned: decision.awardedPoints,
      awarded_points: decision.awardedPoints,
      is_scored: decision.scored,
      is_late: decision.late,
      proof_type: (proofType ?? null) as ProofType,
      note: note || null,
    })
    .select("*")
    .single();

  if (insertError || !checkIn) {
    const message = insertError?.message || "Failed to create check-in";

    if (insertError && isMissingCheckInScoringColumnError(message)) {
      return NextResponse.json(
        {
          error:
            "数据库结构还没有完成升级，请先应用最新的 check-in migration，然后再重试补打卡。",
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ...decision, checkIn });
}
