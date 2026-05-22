import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const grade = searchParams.get("grade");
  const category = searchParams.get("category");
  const search = searchParams.get("search");

  let query = supabase
    .from("reading_articles")
    .select("id, title, category, grade_level, difficulty, word_count, estimated_minutes, topic_key, source, cover_image_url, language")
    .eq("status", "published")
    .order("grade_level", { ascending: true })
    .order("created_at", { ascending: false });

  if (grade) {
    query = query.eq("grade_level", parseInt(grade));
  }

  if (category) {
    query = query.eq("category", category);
  }

  if (search) {
    query = query.ilike("title", `%${search}%`);
  }

  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
  query = query.limit(limit);

  const { data: articles, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ articles: articles || [] });
}
