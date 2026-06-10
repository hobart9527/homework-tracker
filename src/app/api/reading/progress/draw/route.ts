import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProgress } from "@/lib/reading/progression";
import { drawArticle, type DrawMode } from "@/lib/reading/level-router";

// POST /api/reading/progress/draw
// Body: { childId, mode?: "normal" | "challenge" | "too-hard" }
// Returns a DrawResult.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { childId, mode = "normal" } = body;

  if (!childId) {
    return NextResponse.json(
      { error: "Missing childId" },
      { status: 400 }
    );
  }

  if (!["normal", "challenge", "too-hard"].includes(mode)) {
    return NextResponse.json(
      { error: "Invalid mode" },
      { status: 400 }
    );
  }

  try {
    const progress = await getProgress(childId);

    // Guard: challenge mode requires canChallenge.
    if (mode === "challenge" && !progress.canChallenge) {
      return NextResponse.json(
        { error: "Challenge not available yet" },
        { status: 403 }
      );
    }

    const result = await drawArticle(childId, progress, mode as DrawMode);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[progress] draw failed:", error);
    return NextResponse.json(
      { error: "Failed to draw article" },
      { status: 500 }
    );
  }
}
