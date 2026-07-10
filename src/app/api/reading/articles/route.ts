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
  const minGrade = searchParams.get("minGrade");
  const maxGrade = searchParams.get("maxGrade");
  const category = searchParams.get("category");
  const search = searchParams.get("search");
  const language = searchParams.get("language");

  let query = supabase
    .from("reading_articles")
    .select("id, title, category, grade_level, difficulty, word_count, estimated_minutes, topic_key, source, cover_image_url, language", { count: "exact" })
    .eq("status", "published")
    .order("grade_level", { ascending: true })
    .order("created_at", { ascending: false });

  if (grade) {
    query = query.eq("grade_level", parseInt(grade));
  } else if (minGrade || maxGrade) {
    if (minGrade) {
      query = query.gte("grade_level", parseInt(minGrade));
    }
    if (maxGrade) {
      query = query.lte("grade_level", parseInt(maxGrade));
    }
  }

  if (category) {
    query = query.eq("category", category);
  }

  if (search) {
    query = query.ilike("title", `%${search}%`);
  }

  if (language && (language === "zh" || language === "en")) {
    query = query.eq("language", language);
  }

  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 200);
  query = query.limit(limit);

  const { data: articles, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const response = NextResponse.json({ articles: articles || [] });
  if (count !== null && count !== undefined) {
    response.headers.set("X-Total-Count", String(count));
  }
  response.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
  return response;
}
