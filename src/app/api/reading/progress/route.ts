import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProgress } from "@/lib/reading/progression";

// GET /api/reading/progress?childId=xxx
// Returns the child's current ReadingProgress.
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const childId = searchParams.get("childId");

  if (!childId) {
    return NextResponse.json(
      { error: "Missing childId" },
      { status: 400 }
    );
  }

  try {
    const progress = await getProgress(childId);
    return NextResponse.json(progress);
  } catch (error) {
    console.error("[progress] GET failed:", error);
    return NextResponse.json(
      { error: "Failed to load progress" },
      { status: 500 }
    );
  }
}
