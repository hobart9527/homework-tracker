import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ARTICLES_PER_LEVEL = 15;
const STREAK_REQUIRED = 3;
const MIN_ACCURACY = 0.8;

// Level progression: L1 -> L2 -> ... -> L12
const LEVEL_ORDER = ["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8", "L9", "L10", "L11", "L12"];

function getNextLevel(currentLevel: string): string | null {
  const currentIndex = LEVEL_ORDER.indexOf(currentLevel);
  if (currentIndex === -1 || currentIndex >= LEVEL_ORDER.length - 1) {
    return null;
  }
  return LEVEL_ORDER[currentIndex + 1];
}

function canLevelUp(articlesAtLevel: number, streak: number): boolean {
  return articlesAtLevel >= ARTICLES_PER_LEVEL && streak >= STREAK_REQUIRED;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { childId, accuracy, articleId } = body;

    if (!childId || accuracy === undefined) {
      return NextResponse.json({ error: "Missing childId or accuracy" }, { status: 400 });
    }

    // Verify the user is the child or their parent
    const { data: child } = await supabase
      .from("children")
      .select("id, parent_id, reading_level")
      .eq("id", childId)
      .single();

    if (!child) {
      return NextResponse.json({ error: "Child not found" }, { status: 404 });
    }

    const isParent = session.user.id === child.parent_id;
    const isChild = session.user.id === childId;

    if (!isParent && !isChild) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get current reading_stats
    let { data: stats } = await supabase
      .from("reading_stats")
      .select("*")
      .eq("child_id", childId)
      .single();

    // Create stats if not exist
    if (!stats) {
      const defaultLevel = "L3";
      const { data: newStats } = await supabase
        .from("reading_stats")
        .insert({
          child_id: childId,
          reading_level: defaultLevel,
          total_articles_read: 0,
          articles_at_current_level: 0,
          accuracy_streak: 0,
          last_article_date: new Date().toISOString(),
        })
        .select()
        .single();

      stats = newStats;
    }

    // Calculate new values
    const accuracyMet = accuracy >= MIN_ACCURACY;
    const newAccuracyStreak = accuracyMet ? (stats.accuracy_streak || 0) + 1 : 0;
    const newArticlesAtLevel = (stats.articles_at_current_level || 0) + 1;
    const newTotalRead = (stats.total_articles_read || 0) + 1;

    // Check if child can level up
    const currentLevel = child.reading_level || stats.reading_level || "L1";
    const shouldLevelUp = canLevelUp(newArticlesAtLevel, newAccuracyStreak);
    const nextLevel = shouldLevelUp ? getNextLevel(currentLevel) : null;

    // Update reading_stats
    await supabase
      .from("reading_stats")
      .update({
        articles_at_current_level: newArticlesAtLevel,
        accuracy_streak: newAccuracyStreak,
        total_articles_read: newTotalRead,
        last_article_date: new Date().toISOString(),
        // Reset progress after level up
        ...(nextLevel ? {
          reading_level: nextLevel,
          articles_at_current_level: 0,
          accuracy_streak: 0,
        } : {}),
      })
      .eq("child_id", childId);

    // Update children's reading_level if leveled up
    if (nextLevel) {
      await supabase
        .from("children")
        .update({ reading_level: nextLevel })
        .eq("id", childId);
    }

    return NextResponse.json({
      success: true,
      upgraded: !!nextLevel,
      newLevel: nextLevel || null,
      currentLevel: nextLevel || currentLevel,
      stats: {
        articles_at_current_level: nextLevel ? 0 : newArticlesAtLevel,
        accuracy_streak: nextLevel ? 0 : newAccuracyStreak,
        total_articles_read: newTotalRead,
      },
    });
  } catch (error) {
    console.error("Error updating reading stats:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
