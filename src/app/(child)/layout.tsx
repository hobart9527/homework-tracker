"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

type Child = Database["public"]["Tables"]["children"]["Row"];
type CheckIn = Database["public"]["Tables"]["check_ins"]["Row"];
export default function ChildLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
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

  return (
    <div className="min-h-screen bg-background">
      {/* Child header */}
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

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-forest-100 px-4 py-3 z-50 min-h-[56px]">
        <div className="max-w-5xl mx-auto flex justify-around">
          {[
            { href: "/", label: "今日", icon: "📋" },
            { href: "/progress", label: "进度", icon: "📊" },
            { href: "/rewards", label: "积分", icon: "⭐" },
            { href: "/reading", label: "阅读", icon: "📚" },
          ].map(({ href, label, icon }) => {
            const isActive =
              href === "/"
                ? pathname === "/"
                : pathname?.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center py-2 transition-colors ${
                  isActive ? "text-primary" : "text-forest-400"
                }`}
              >
                <span className="text-3xl">{icon}</span>
                <span className="text-sm">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="pb-20">{children}</div>
    </div>
  );
}
