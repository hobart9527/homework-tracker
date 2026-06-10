import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  recordAttempt,
  applyLevelChange,
  type LevelVariant,
} from "@/lib/reading/progression";
import { checkLevelUp, getProgress } from "@/lib/reading/progression";

// POST /api/reading/progress/attempt
// Body: { childId, articleId, levelVariant, correctCount, totalQuestions, difficultyFeel }
// Records a quiz attempt and returns updated progress.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    childId,
    articleId,
    levelVariant,
    correctCount,
    totalQuestions,
    difficultyFeel,
  } = body;

  if (
    !childId ||
    !articleId ||
    !levelVariant ||
    correctCount == null ||
    totalQuestions == null ||
    difficultyFeel == null
  ) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  if (!["L1", "L2", "L3"].includes(levelVariant)) {
    return NextResponse.json(
      { error: "Invalid levelVariant" },
      { status: 400 }
    );
  }

  try {
    let progress = await recordAttempt({
      childId,
      articleId,
      levelVariant: levelVariant as LevelVariant,
      correctCount: Number(correctCount),
      totalQuestions: Number(totalQuestions),
      difficultyFeel: Number(difficultyFeel),
    });

    // If the attempt triggered a level-up, apply it.
    if (progress.canLevelUp) {
      const nextLv = nextLevel(progress.currentLevel);
      if (nextLv) {
        await applyLevelChange(childId, nextLv);
        progress = await getProgress(childId);
      }
    }

    return NextResponse.json(progress);
  } catch (error) {
    console.error("[progress] attempt failed:", error);
    return NextResponse.json(
      { error: "Failed to record attempt" },
      { status: 500 }
    );
  }
}

function nextLevel(lv: LevelVariant): LevelVariant | null {
  if (lv === "L1") return "L2";
  if (lv === "L2") return "L3";
  return null;
}
