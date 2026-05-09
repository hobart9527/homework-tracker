"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ChildShell from "@/components/ui/ChildShell";
import type { Database } from "@/lib/supabase/types";

type Child = Database["public"]["Tables"]["children"]["Row"];
type CheckIn = Database["public"]["Tables"]["check_ins"]["Row"];

export default function ChildLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [child, setChild] = useState<Child | null>(null);
  const [totalPoints, setTotalPoints] = useState(0);
  const [supabase] = useState(() => createClient());
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/child-login");
        return;
      }

      const [{ data: childData }, { data: checkInsData }] = await Promise.all([
        supabase
          .from("children")
          .select("*")
          .eq("id", session.user.id)
          .single(),
        supabase
          .from("check_ins")
          .select("points_earned")
          .eq("child_id", session.user.id),
      ]);

      if (!childData) {
        router.push("/child-login");
        return;
      }

      setChild(childData);
      const points = checkInsData?.reduce((sum, ci) => sum + (ci.points_earned || 0), 0) || 0;
      setTotalPoints(points);
      setLoading(false);
    };

    const handlePointsChanged = () => {
      void checkAuth();
    };

    void checkAuth();
    window.addEventListener("child-points-changed", handlePointsChanged);

    return () => {
      window.removeEventListener("child-points-changed", handlePointsChanged);
    };
  }, [router, supabase]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-2xl">🦊 加载中...</div>
      </div>
    );
  }

  const header = (
    <header className="bg-white/90 backdrop-blur-md border-b border-forest-100 text-forest-800 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{child?.avatar || "🦊"}</span>
          <div>
            <h1 className="font-bold">{child?.name}</h1>
            <p className="text-sm opacity-80">积分: {totalPoints}</p>
          </div>
        </div>
        {confirmingLogout ? (
          <div className="flex items-center gap-2 bg-rose-50 px-3 py-1.5 rounded-lg">
            <span className="text-xs text-rose-700">确认退出？</span>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                router.push("/child-login");
              }}
              className="text-xs bg-rose-500 text-white px-2 py-1 rounded-md"
            >
              退出
            </button>
            <button
              onClick={() => setConfirmingLogout(false)}
              className="text-xs text-forest-600 px-2 py-1"
            >
              取消
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingLogout(true)}
            className="text-sm bg-forest-100 text-forest-700 px-3 py-1 rounded-lg"
          >
            退出
          </button>
        )}
      </div>
    </header>
  );

  return (
    <ChildShell hero={header}>
      {children}
    </ChildShell>
  );
}
