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

  const handleSave = async () => {
    setLoading(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    await supabase
      .from("parents")
      .update(formData)
      .eq("id", session.user.id);

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

      <Button onClick={handleSave} disabled={loading}>
        {loading ? "保存中..." : "保存设置"}
      </Button>
    </div>
  );
}
