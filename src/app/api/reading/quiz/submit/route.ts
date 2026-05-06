import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const BASE_READING_POINTS = 10;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { childId, articleId, assignmentId, answers, timeSpentSeconds } = body;

  if (!childId || !articleId || !answers) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    // Fetch questions to validate answers
    const { data: questions } = await supabase
      .from("reading_questions")
      .select("id, correct_answer")
      .eq("article_id", articleId);

    if (!questions || questions.length === 0) {
      return NextResponse.json({ error: "No questions found for this article" }, { status: 404 });
    }

    // Build answer map
    const correctMap = new Map(questions.map((q) => [q.id, q.correct_answer]));

    const gradedAnswers = answers.map(
      (a: { questionId: string; selectedLabel: string }) => ({
        question_id: a.questionId,
        selected: a.selectedLabel,
        correct: correctMap.get(a.questionId) === a.selectedLabel,
      })
    );

    const score = gradedAnswers.filter((a: { correct: boolean }) => a.correct).length;
    const total = questions.length;
    const pointsEarned = Math.round(BASE_READING_POINTS * (score / total));

    // Insert quiz attempt
    const { error: attemptError } = await supabase
      .from("reading_quiz_attempts")
      .insert({
        child_id: childId,
        article_id: articleId,
        assignment_id: assignmentId || null,
        answers: gradedAnswers,
        score,
        total_questions: total,
        time_spent_seconds: timeSpentSeconds || 0,
      });

    if (attemptError) {
      console.error("Failed to save quiz attempt:", attemptError);
    }

    // Update assignment status if applicable
    if (assignmentId) {
      await supabase
        .from("reading_assignments")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", assignmentId);
    }

    // Create check-in record for points
    const { data: article } = await supabase
      .from("reading_articles")
      .select("title")
      .eq("id", articleId)
      .single();

    const { data: insertedCheckIns, error: checkInError } = await supabase
      .from("check_ins")
      .insert({
        child_id: childId,
        homework_id: null,
        completed_at: new Date().toISOString(),
        points_earned: pointsEarned,
        note: `阅读: ${article?.title || "文章"} (${score}/${total})`,
      })
      .select("id");

    // Link check-in to pending reading homework if exists
    const checkInId = insertedCheckIns?.[0]?.id;
    if (checkInId) {
      const { data: readingHomeworks } = await supabase
        .from("homeworks")
        .select("id")
        .eq("child_id", childId)
        .eq("type_name", "英文阅读")
        .is("deleted_at", null);

      if (readingHomeworks && readingHomeworks.length > 0) {
        const today = new Date().toISOString().split("T")[0];
        const { data: todayCheckIns } = await supabase
          .from("check_ins")
          .select("homework_id")
          .eq("child_id", childId)
          .gte("completed_at", `${today}T00:00:00Z`)
          .lte("completed_at", `${today}T23:59:59Z`)
          .not("homework_id", "is", null);

        const completedHomeworkIds = new Set((todayCheckIns || []).map(c => c.homework_id));
        const pendingHomework = readingHomeworks.find(h => !completedHomeworkIds.has(h.id));

        if (pendingHomework) {
          await supabase
            .from("check_ins")
            .update({ homework_id: pendingHomework.id })
            .eq("id", checkInId);
        }
      }
    }

    return NextResponse.json({
      score,
      total,
      pointsEarned,
      answers: gradedAnswers,
    });
  } catch (error) {
    console.error("Quiz submit error:", error);
    return NextResponse.json({ error: "Failed to submit quiz" }, { status: 500 });
  }
}
