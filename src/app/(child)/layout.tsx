"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

type Child = Database["public"]["Tables"]["children"]["Row"];

export default function ChildLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [child, setChild] = useState<Child | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/login");
        return;
      }

      const { data: childData } = await supabase
        .from("children")
        .select("*")
        .eq("id", session.user.id)
        .single();

      if (!childData) {
        router.push("/login");
        return;
      }

      setChild(childData);
      setLoading(false);
    };

    checkAuth();
  }, [router, supabase]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-2xl">🦊 加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Child header */}
      <header className="bg-primary text-white p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{child?.avatar || "🦊"}</span>
            <div>
              <h1 className="font-bold">{child?.name}</h1>
              <p className="text-sm opacity-80">积分: {child?.points}</p>
            </div>
          </div>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              router.push("/login");
            }}
            className="text-sm bg-white/20 px-3 py-1 rounded-lg"
          >
            退出
          </button>
        </div>
      </header>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-forest-100 px-4 py-2">
        <div className="max-w-2xl mx-auto flex justify-around">
          <Link href="/today" className="flex flex-col items-center text-primary">
            <span className="text-2xl">📋</span>
            <span className="text-xs">今日</span>
          </Link>
          <Link href="/progress" className="flex flex-col items-center text-forest-400">
            <span className="text-2xl">📊</span>
            <span className="text-xs">进度</span>
          </Link>
          <Link href="/rewards" className="flex flex-col items-center text-forest-400">
            <span className="text-2xl">⭐</span>
            <span className="text-xs">积分</span>
          </Link>
        </div>
      </nav>

      <div className="pb-20">{children}</div>
    </div>
  );
}
