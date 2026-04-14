import { createClient } from "@/lib/supabase/server";
import {
  buildCheckInInsertPayload,
  buildLegacyCheckInInsertPayload,
  buildSubmissionDecision,
  isMissingCheckInScoringColumnError,
  isProofType,
  normalizeLegacyCheckInRecord,
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

  const completedAt = now.toISOString();
  const primaryPayload = buildCheckInInsertPayload({
    homeworkId: homework.id,
    childId: session.user.id,
    completedAt,
    note,
    proofType: (proofType ?? null) as ProofType,
    result: decision,
  });

  const { data: checkIn, error: insertError } = await supabase
    .from("check_ins")
    .insert(primaryPayload)
    .select("*")
    .single();

  if (insertError && isMissingCheckInScoringColumnError(insertError.message)) {
    const { data: legacyCheckIn, error: legacyInsertError } = await supabase
      .from("check_ins")
      .insert(
        buildLegacyCheckInInsertPayload({
          homeworkId: homework.id,
          childId: session.user.id,
          completedAt,
          note,
          result: decision,
        })
      )
      .select("*")
      .single();

    if (legacyInsertError || !legacyCheckIn) {
      return NextResponse.json(
        {
          error: legacyInsertError?.message || "Failed to create check-in",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ...decision,
      checkIn: normalizeLegacyCheckInRecord({
        checkIn: legacyCheckIn,
        result: decision,
      }),
      usedLegacySchemaFallback: true,
    });
  }

  if (insertError || !checkIn) {
    return NextResponse.json(
      { error: insertError?.message || "Failed to create check-in" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ...decision, checkIn });
}
