import { createClient } from "@/lib/supabase/server";
import { sendTelegramTextMessage } from "@/lib/telegram";
import { NextResponse } from "next/server";

export async function POST() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: parent, error } = await supabase
    .from("parents")
    .select("telegram_chat_id, telegram_recipient_label")
    .eq("id", session.user.id)
    .single();

  if (error || !parent) {
    return NextResponse.json(
      { error: error?.message ?? "Parent settings not found" },
      { status: 500 }
    );
  }

  if (!botToken || !parent.telegram_chat_id) {
    return NextResponse.json(
      {
        error: "缺少 Telegram Bot Token 或 Chat ID，无法发送测试消息。",
      },
      { status: 400 }
    );
  }

  try {
    await sendTelegramTextMessage({
      botToken,
      chatId: parent.telegram_chat_id,
      text: `Homework Tracker 测试消息：当前家庭通道配置可用${
        parent.telegram_recipient_label
          ? `（${parent.telegram_recipient_label}）`
          : ""
      }。`,
    });

    return NextResponse.json({
      ok: true,
      message: "Telegram 测试消息已发送。",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Telegram 测试消息发送失败。",
      },
      { status: 502 }
    );
  }
}
