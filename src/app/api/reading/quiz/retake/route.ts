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

    return NextResponse.json({
      score,
      total,
      pointsEarned,
      answers: gradedAnswers,
    });
  } catch (error) {
    console.error("Quiz retake error:", error);
    return NextResponse.json({ error: "Failed to submit retake" }, { status: 500 });
  }
}
