import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const { articleId, title, category } = await req.json();

    if (!articleId || !title) {
      return NextResponse.json({ error: "缺少参数" }, { status: 400 });
    }

    const supabase = await createClient();

    // 检查是否已有封面
    const { data: existing } = await supabase
      .from('reading_articles')
      .select('cover_image_url')
      .eq('id', articleId)
      .single();

    if (existing?.cover_image_url) {
      return NextResponse.json({ imageUrl: existing.cover_image_url });
    }

    // 调用 Minimax image-01 API
    const categoryPrompts: Record<string, string> = {
      '时事': 'news illustration',
      '历史': 'historical illustration',
      '科学': 'science illustration',
      '人物': 'portrait illustration',
      '自然': 'nature illustration',
      '文化': 'cultural illustration',
    };

    const prompt = `${categoryPrompts[category] || 'illustration'}, ${title}, children's book style, warm colors, simple and cute, no text`;

    // 使用 OpenAI-compatible API 端点 (MiniMax)
    const apiBaseUrl = process.env.OPENAI_BASE_URL || "https://api.minimaxi.com/v1";
    const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_READING_KEY;

    const response = await fetch(`${apiBaseUrl}/image_generation`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "image-01",
        prompt: `${prompt}, random seed: ${Math.random().toString(36).slice(2)}`,
        aspect_ratio: "3:2",
      }),
    });

    if (!response.ok) {
      throw new Error("Image generation failed");
    }

    const data = await response.json();
    const imageUrl = data.data?.[0]?.url;

    if (imageUrl) {
      // 保存到数据库
      await supabase
        .from('reading_articles')
        .update({ cover_image_url: imageUrl })
        .eq('id', articleId);
    }

    return NextResponse.json({ imageUrl });
  } catch (error) {
    console.error("Generate cover error:", error);
    return NextResponse.json({ error: "生成失败" }, { status: 500 });
  }
}
