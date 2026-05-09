import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const RAZ_TO_GRADE: Record<string, number> = {
  L1: 1, L2: 2, L3: 3, L4: 4,
  L5: 5, L6: 6, L7: 7, L8: 8,
  L9: 9, L10: 10, L11: 11, L12: 12,
};

function getDefaultReadingLevel(): string {
  return "L3";
}

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

  // Check if the user has permission to view this child's stats
  const { data: child } = await supabase
    .from("children")
    .select("id, parent_id")
    .eq("id", childId)
    .single();

  if (!child) {
    return NextResponse.json({ error: "Child not found" }, { status: 404 });
  }

  // Children can only view their own stats; parents can view their children's stats
  const isParent = session.user.id === child.parent_id;
  const isChild = session.user.id === childId;

  if (!isParent && !isChild) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get or create reading_stats for this child
  let { data: stats, error } = await supabase
    .from("reading_stats")
    .select("*")
    .eq("child_id", childId)
    .single();

  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Auto-create default stats if not exist
  if (!stats) {
    const defaultLevel = getDefaultReadingLevel();
    const { data: newStats, error: createError } = await supabase
      .from("reading_stats")
      .insert({
        child_id: childId,
        reading_level: defaultLevel,
        total_articles_read: 0,
        articles_at_current_level: 0,
        accuracy_streak: 0,
        last_article_date: null,
      })
      .select()
      .single();

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 500 });
    }

    stats = newStats;
  }

  // Get child's current reading_level from children table
  const { data: childData } = await supabase
    .from("children")
    .select("reading_level")
    .eq("id", childId)
    .single();

  const readingLevel = childData?.reading_level || stats.reading_level;

  return NextResponse.json({
    child_id: stats.child_id,
    reading_level: readingLevel,
    total_articles_read: stats.total_articles_read || 0,
    articles_at_current_level: stats.articles_at_current_level || 0,
    accuracy_streak: stats.accuracy_streak || 0,
    last_article_date: stats.last_article_date,
    // Derived info
    grade_equivalent: RAZ_TO_GRADE[readingLevel] || 3,
  });
}
