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

  if (!childId) {
    return NextResponse.json({ error: "Missing childId" }, { status: 400 });
  }

  try {
    // 1. Check for existing uncompleted assignments
    const { data: assignment } = await supabase
      .from("reading_assignments")
      .select("*, article:article_id(*)")
      .eq("child_id", childId)
      .neq("status", "completed")
      .order("assigned_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (assignment?.article) {
      return NextResponse.json({
        article: assignment.article,
        assignmentId: assignment.id,
      });
    }

    // 2. Auto-recommend
    const { data: child } = await supabase
      .from("children")
      .select("reading_grade_level")
      .eq("id", childId)
      .single();

    const gradeLevel = child?.reading_grade_level || 3;

    // Get already-read article IDs
    const { data: readAssignments } = await supabase
      .from("reading_assignments")
      .select("article_id")
      .eq("child_id", childId);
    const readIds = readAssignments?.map((a) => a.article_id) || [];

    // Find unread published articles at this grade level
    let query = supabase
      .from("reading_articles")
      .select("*")
      .eq("grade_level", gradeLevel)
      .eq("status", "published");

    if (readIds.length > 0) {
      query = query.not("id", "in", `(${readIds.join(",")})`);
    }

    const { data: articles } = await query;

    if (!articles || articles.length === 0) {
      return NextResponse.json({ article: null });
    }

    // Pick random unread article
    const pick = articles[Math.floor(Math.random() * articles.length)];
    return NextResponse.json({ article: pick, assignmentId: null });
  } catch (error) {
    console.error("Recommend error:", error);
    return NextResponse.json({ error: "Failed to get recommendation" }, { status: 500 });
  }
}
