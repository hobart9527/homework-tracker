"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SettingsShell } from "@/components/parent/SettingsShell";
import { ReminderSettings } from "@/components/parent/ReminderSettings";
import { Card } from "@/components/ui/Card";
import type { Database } from "@/lib/supabase/types";

type Parent = Database["public"]["Tables"]["parents"]["Row"];

export default function SettingsChannelsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [parent, setParent] = useState<Parent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchParent = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("parents")
        .select("*")
        .eq("id", session.user.id)
        .single();

      if (data) {
        setParent(data);
      }
      setLoading(false);
    };

    fetchParent();
  }, [supabase]);

  if (loading || !parent) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-ui-lg">加载中...</div>
      </div>
    );
  }

  return (
    <SettingsShell
      title="通知通道"
      description="管理 Telegram 通知通道和提醒偏好。"
      backHref="/settings"
    >
      <Card id="reminder-settings" className="scroll-mt-4">
        <h2 className="mb-4 font-bold text-forest-700">提醒与 Telegram</h2>
        <p className="mb-4 text-ui-sm text-forest-500">
          Telegram 通道在此配置家庭级 Chat ID；Bot Token 由服务端提供。
        </p>
        <ReminderSettings
          settings={parent}
          onUpdate={() => window.location.reload()}
        />
      </Card>
    </SettingsShell>
  );
}
