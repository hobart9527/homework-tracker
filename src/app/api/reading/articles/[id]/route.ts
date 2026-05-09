import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const { data: article, error: articleError } = await supabase
    .from("reading_articles")
    .select("*")
    .eq("id", id)
    .eq("status", "published")
    .single();

  if (articleError || !article) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  const { data: questions } = await supabase
    .from("reading_questions")
    .select("*")
    .eq("article_id", id)
    .order("order_index", { ascending: true });

  const { data: illustrations } = await supabase
    .from("reading_article_illustrations")
    .select("paragraph_index, image_url, scene_description")
    .eq("article_id", id)
    .order("paragraph_index", { ascending: true });

  return NextResponse.json({
    article,
    questions: questions || [],
    illustrations: illustrations || [],
  });
}
