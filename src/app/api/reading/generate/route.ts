import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateArticleContent, convertToRubyPinyin, coerceQuestionType } from "@/lib/reading";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { sourceText, sourceUrl, gradeLevel, category, topicKey, source } = body;

  if (!sourceText || !gradeLevel || !category || !topicKey) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    const { article: generated, questions: generatedQuestions } = await generateArticleContent({
      sourceText,
      sourceUrl: sourceUrl || undefined,
      gradeLevel,
      category,
      topicKey,
    });

    // Detect Chinese content and compute pinyin
    const isChinese = /[一-鿿]/.test(generated.content);
    const language = isChinese ? "zh" : "en";
    const pinyin_content = isChinese ? convertToRubyPinyin(generated.content) : null;

    // Insert article
    const { data: articleData, error: articleError } = await supabase
      .from("reading_articles")
      .upsert({
        topic_key: topicKey,
        title: generated.title,
        content: generated.content,
        source: source || "manual",
        source_url: sourceUrl || null,
        category,
        grade_level: gradeLevel,
        word_count: generated.word_count,
        estimated_minutes: generated.estimated_minutes,
        difficulty: generated.difficulty,
        status: "published",
        language,
        pinyin_content,
      }, { onConflict: "topic_key,grade_level" })
      .select()
      .single();

    if (articleError || !articleData) {
      throw new Error(articleError?.message || "Failed to insert article");
    }

    // Insert questions
    const questionRows = generatedQuestions.map((q, i) => ({
      article_id: articleData.id,
      question_text: q.question_text,
      question_type: coerceQuestionType(q.question_type),
      options: q.options,
      correct_answer: q.correct_answer,
      difficulty: q.difficulty,
      order_index: i,
      hint: q.hint ?? null,
      explanation: q.explanation ?? null,
    }));

    const { data: questions, error: questionsError } = await supabase
      .from("reading_questions")
      .insert(questionRows)
      .select();

    if (questionsError) throw new Error(questionsError.message);

    return NextResponse.json({ article: articleData, questions });
  } catch (error) {
    console.error("Generate error:", error);
    return NextResponse.json({ error: "Failed to generate content" }, { status: 500 });
  }
}
