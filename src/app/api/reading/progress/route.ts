import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const childId = searchParams.get("childId");
  const month = searchParams.get("month");

  if (!childId || !month) {
    return NextResponse.json({ error: "Missing childId or month" }, { status: 400 });
  }

  const startDate = `${month}-01`;
  const [year, mon] = month.split("-").map(Number);
  const lastDay = new Date(year, mon, 0).getDate();
  const endDate = `${month}-${String(lastDay).padStart(2, "0")}`;

  const { data: attempts, error } = await supabase
    .from("reading_quiz_attempts")
    .select("*, article:article_id(title, category, grade_level)")
    .eq("child_id", childId)
    .gte("created_at", `${startDate}T00:00:00Z`)
    .lte("created_at", `${endDate}T23:59:59Z`)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const totalRead = attempts?.length || 0;
  let sumScore = 0;
  let sumPoints = 0;
  for (const a of attempts || []) {
    const pct = a.score / a.total_questions;
    sumScore += pct * 100;
    sumPoints += Math.round(10 * pct);
  }
  const avgScore = totalRead > 0 ? Math.round(sumScore / totalRead) : 0;

  return NextResponse.json({
    totalRead,
    avgScore,
    totalPoints: sumPoints,
    recent: (attempts || []).slice(0, 10).map((a) => ({
      title: (a.article as Record<string, unknown>)?.title || "",
      category: (a.article as Record<string, unknown>)?.category || "",
      gradeLevel: (a.article as Record<string, unknown>)?.grade_level || 0,
      score: a.score,
      total: a.total_questions,
      date: a.created_at,
    })),
  });
}
