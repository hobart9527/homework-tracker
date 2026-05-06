import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { childId, articleId } = body;

  if (!childId || !articleId) {
    return NextResponse.json({ error: "Missing childId or articleId" }, { status: 400 });
  }

  // Verify parent owns this child
  const { data: child } = await supabase
    .from("children")
    .select("id")
    .eq("id", childId)
    .eq("parent_id", session.user.id)
    .single();

  if (!child) {
    return NextResponse.json({ error: "Child not found or not authorized" }, { status: 403 });
  }

  const { data: assignment, error } = await supabase
    .from("reading_assignments")
    .upsert(
      {
        child_id: childId,
        article_id: articleId,
        status: "recommended",
        assigned_by: session.user.id,
        assigned_date: new Date().toISOString().split("T")[0],
      },
      { onConflict: "child_id,article_id" }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ assignment });
}
