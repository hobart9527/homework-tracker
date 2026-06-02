"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import ChildShell from "@/components/ui/ChildShell";
import { useTranslation } from "@/hooks/useTranslation";
import type { Database } from "@/lib/supabase/types";

type Child = Database["public"]["Tables"]["children"]["Row"];
type CheckIn = Database["public"]["Tables"]["check_ins"]["Row"];

export default function ChildLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const locale = useLocale();
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
        router.push(`/${locale}/child-login`);
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
        router.push(`/${locale}/child-login`);
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
        <div className="text-2xl"><svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 inline-block mr-2"><path d="M12 2C9.5 2 7.5 4 7 6.5C5.5 6.5 4 8 4 10c0 1.5.8 2.8 2 3.5-1 1-1.5 2.5-1.5 4C4.5 19 6 21 8 21c1 0 1.8-.5 2.3-1.2L10 22h4l-.3-2.2C14.2 20.5 15 21 16 21c2 0 3.5-2 3.5-3.5 0-1.5-.5-3-1.5-4 1.2-.7 2-2 2-3.5 0-2-1.5-3.5-3-3.5C16.5 4 14.5 2 12 2zM9 10c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1zm6 0c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1z"/></svg> {t('child.layout.loading')}</div>
      </div>
    );
  }

  const header = (
    <header className="bg-white/90 backdrop-blur-md border-b border-forest-100 text-forest-800 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{child?.avatar ? (
            <>{child.avatar}</>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-9 h-9">
              <path d="M12 2C9.5 2 7.5 4 7 6.5C5.5 6.5 4 8 4 10c0 1.5.8 2.8 2 3.5-1 1-1.5 2.5-1.5 4C4.5 19 6 21 8 21c1 0 1.8-.5 2.3-1.2L10 22h4l-.3-2.2C14.2 20.5 15 21 16 21c2 0 3.5-2 3.5-3.5 0-1.5-.5-3-1.5-4 1.2-.7 2-2 2-3.5 0-2-1.5-3.5-3-3.5C16.5 4 14.5 2 12 2zM9 10c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1zm6 0c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1z"/>
            </svg>
          )}</span>
          <div>
            <h1 className="font-bold">{child?.name}</h1>
            <p className="text-sm opacity-80">{t('child.layout.points', { totalPoints })}</p>
          </div>
        </div>
        {confirmingLogout ? (
          <div className="flex items-center gap-2 bg-rose-50 px-3 py-1.5 rounded-lg">
            <span className="text-xs text-rose-700">{t('child.layout.confirmLogout')}</span>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                router.push(`/${locale}/child-login`);
              }}
              className="text-xs bg-rose-500 text-white px-2 py-1 rounded-md"
            >
              {t('child.layout.logout')}
            </button>
            <button
              onClick={() => setConfirmingLogout(false)}
              className="text-xs text-forest-600 px-2 py-1"
            >
              {t('child.layout.cancel')}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingLogout(true)}
            className="text-sm bg-forest-100 text-forest-700 px-3 py-1 rounded-lg"
          >
            {t('child.layout.logout')}
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
