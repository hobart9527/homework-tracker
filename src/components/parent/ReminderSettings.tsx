"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { Database } from "@/lib/supabase/types";

type ReminderSettings = Database["public"]["Tables"]["parents"]["Row"];

interface ReminderSettingsProps {
  settings: ReminderSettings;
  onUpdate: () => void;
}

export function ReminderSettings({ settings, onUpdate }: ReminderSettingsProps) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    reminder_cutoff_time: settings.reminder_cutoff_time || "20:00",
    auto_remind_parent: settings.auto_remind_parent ?? true,
    auto_remind_child: settings.auto_remind_child ?? false,
    telegram_chat_id: settings.telegram_chat_id || "",
    telegram_recipient_label: settings.telegram_recipient_label || "",
  });
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [telegramTestMessage, setTelegramTestMessage] = useState<string | null>(
    null
  );
  const [telegramTestTone, setTelegramTestTone] = useState<
    "success" | "danger" | null
  >(null);

  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveTone, setSaveTone] = useState<"success" | "danger" | null>(null);

  const handleSave = async () => {
    setLoading(true);
    setSaveMessage(null);
    setSaveTone(null);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setSaveTone("danger");
      setSaveMessage("未登录，无法保存。");
      setLoading(false);
      return;
    }

    const { error } = await supabase
      .from("parents")
      .update(formData)
      .eq("id", session.user.id);

    if (error) {
      setSaveTone("danger");
      setSaveMessage(error.message || "保存失败，请检查数据库配置。");
      setLoading(false);
      return;
    }

    setSaveTone("success");
    setSaveMessage("设置已保存。");
    setLoading(false);
    onUpdate();
  };

  return (
    <div className="space-y-4">
      <Input
        label="每日截止时间"
        type="time"
        value={formData.reminder_cutoff_time}
        onChange={(e) =>
          setFormData((prev) => ({
            ...prev,
            reminder_cutoff_time: e.target.value,
          }))
        }
      />

      <Input
        label="Telegram Chat ID"
        value={formData.telegram_chat_id}
        onChange={(e) =>
          setFormData((prev) => ({
            ...prev,
            telegram_chat_id: e.target.value,
          }))
        }
        placeholder="例如 123456789"
      />

      <Input
        label="接收人备注"
        value={formData.telegram_recipient_label}
        onChange={(e) =>
          setFormData((prev) => ({
            ...prev,
            telegram_recipient_label: e.target.value,
          }))
        }
        placeholder="例如 家长通知"
      />

      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-forest-700">逾期自动提醒家长</p>
          <p className="text-sm text-forest-500">超过截止时间未完成时自动提醒</p>
        </div>
        <button
          onClick={() =>
            setFormData((prev) => ({
              ...prev,
              auto_remind_parent: !prev.auto_remind_parent,
            }))
          }
          className={`w-12 h-6 rounded-full transition-colors ${
            formData.auto_remind_parent ? "bg-primary" : "bg-forest-200"
          }`}
        >
          <div
            className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
              formData.auto_remind_parent ? "translate-x-6" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      <div className="rounded-xl border border-forest-100 bg-forest-50/70 px-4 py-3 text-sm text-forest-600">
        <p className="font-medium text-forest-700">Telegram 运行要求</p>
        <p className="mt-1">要真正发出 Telegram 消息，需要家庭级 Chat ID，以及服务端环境中的 Telegram Bot Token。</p>
        <p className="mt-1">
          现在这个页面支持保存后直接发送一条测试消息，帮助你确认家庭通道配置是否真实可用。
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={handleSave} disabled={loading}>
          {loading ? "保存中..." : "保存设置"}
        </Button>

        {saveMessage ? (
          <p
            className={`text-sm self-center ${
              saveTone === "success" ? "text-emerald-700" : "text-rose-700"
            }`}
          >
            {saveMessage}
          </p>
        ) : null}

        <Button
          type="button"
          variant="secondary"
          disabled={testingTelegram}
          onClick={async () => {
            setTestingTelegram(true);
            setTelegramTestMessage(null);
            setTelegramTestTone(null);

            try {
              const response = await fetch("/api/channels/telegram/test", {
                method: "POST",
              });
              const body = await response.json();

              if (!response.ok) {
                setTelegramTestTone("danger");
                setTelegramTestMessage(
                  body.error || "Telegram 测试消息发送失败。"
                );
                return;
              }

              setTelegramTestTone("success");
              setTelegramTestMessage(body.message || "Telegram 测试消息已发送。");
            } catch (error) {
              setTelegramTestTone("danger");
              setTelegramTestMessage(
                error instanceof Error
                  ? error.message
                  : "Telegram 测试消息发送失败。"
              );
            } finally {
              setTestingTelegram(false);
            }
          }}
        >
          {testingTelegram ? "发送中..." : "发送 Telegram 测试消息"}
        </Button>
      </div>

      {telegramTestMessage ? (
        <p
          className={`text-sm ${
            telegramTestTone === "success" ? "text-emerald-700" : "text-rose-700"
          }`}
        >
          {telegramTestMessage}
        </p>
      ) : null}
    </div>
  );
}
