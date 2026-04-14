"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ReminderSettings } from "@/components/parent/ReminderSettings";
import { QuickTypeManager } from "@/components/parent/QuickTypeManager";
import type { Database } from "@/lib/supabase/types";

type Parent = Database["public"]["Tables"]["parents"]["Row"];
type CustomType = Database["public"]["Tables"]["custom_homework_types"]["Row"];

export default function SettingsPage() {
  const supabase = createClient();
  const [parent, setParent] = useState<Parent | null>(null);
  const [loading, setLoading] = useState(true);
  const [customTypes, setCustomTypes] = useState<CustomType[]>([]);

  useEffect(() => {
    const fetchParent = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const { data } = await supabase
        .from("parents")
        .select("*")
        .eq("id", session.user.id)
        .single();

      if (data) setParent(data);
      setLoading(false);
    };

    fetchParent();
  }, [supabase]);

  useEffect(() => {
    const fetchTypes = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase
        .from("custom_homework_types")
        .select("*")
        .eq("parent_id", session.user.id);
      if (data) setCustomTypes(data);
    };
    fetchTypes();
  }, [supabase]);

  if (loading || !parent) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-2xl">🦊 加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary text-white p-4">
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <Link href="/dashboard">
            <span className="text-xl">←</span>
          </Link>
          <h1 className="text-xl font-bold">设置</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-4">
        <Card>
          <QuickTypeManager
            types={customTypes}
            onAdd={async (name, icon, points) => {
              const { data: { session } } = await supabase.auth.getSession();
              if (!session) return;
              const { data } = await supabase
                .from("custom_homework_types")
                .insert({ parent_id: session.user.id, name, icon, default_points: points })
                .select()
                .single();
              if (data) setCustomTypes((prev) => [...prev, data]);
            }}
            onUpdate={async (id, name, icon, points) => {
              await supabase.from("custom_homework_types").update({ name, icon, default_points: points }).eq("id", id);
              setCustomTypes((prev) => prev.map((t) => t.id === id ? { ...t, name, icon, default_points: points } : t));
            }}
            onDelete={async (id) => {
              await supabase.from("custom_homework_types").delete().eq("id", id);
              setCustomTypes((prev) => prev.filter((t) => t.id !== id));
            }}
          />
        </Card>

        <Card>
          <h2 className="font-bold text-forest-700 mb-4">提醒设置</h2>
          <ReminderSettings
            settings={parent}
            onUpdate={() => window.location.reload()}
          />
        </Card>

        <Card>
          <h2 className="font-bold text-forest-700 mb-4">账户</h2>
          <Button
            variant="ghost"
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/login";
            }}
          >
            退出登录
          </Button>
        </Card>
      </main>
    </div>
  );
}
