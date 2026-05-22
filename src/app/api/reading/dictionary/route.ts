import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { lookupChineseWord } from "@/lib/reading/dictionary-cccedict";

const CHINESE_CHAR_PATTERN = /^[一-龥]+$/;

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const word = searchParams.get("word");

  if (!word) {
    return NextResponse.json({ error: "Missing required parameter: word" }, { status: 400 });
  }

  if (!CHINESE_CHAR_PATTERN.test(word)) {
    return NextResponse.json(
      { error: "Invalid word format: must contain only Chinese characters" },
      { status: 400 }
    );
  }

  try {
    const entry = await lookupChineseWord(word);

    if (!entry) {
      return NextResponse.json({ word, pinyin: null, definition: null });
    }

    return NextResponse.json({
      word,
      pinyin: entry.pinyin,
      definition: entry.definition,
      ...(entry.traditional ? { traditional: entry.traditional } : {}),
    });
  } catch (err) {
    console.error("[dictionary API]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
