"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { PasscodeInput } from "@/components/ui/PasscodeInput";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";

export default function ParentLoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");

  const handlePasscodeComplete = async (passcode: string) => {
    setLoading(true);
    setLoadingStep("正在验证密码…");
    setError("");

    try {
      // Look up parent by passcode via SQL function (bypasses RLS)
      const { data: parents, error: findError } = await supabase.rpc(
        "get_parent_by_passcode",
        { passcode_param: passcode }
      );

      console.log("RPC result:", { parents, findError });

      const parent = parents?.[0];
      if (findError || !parent) {
        if (findError?.message?.includes("fetch") || findError?.message?.includes("network")) {
          setError("网络连接失败，请检查网络后重试");
        } else if (!parent) {
          setError("密码错误，请重试");
        } else {
          setError("密码错误，请重试");
        }
        setLoading(false);
        setLoadingStep("");
        return;
      }

      setLoadingStep("正在登录…");

      // Set session for parent
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.signInWithPassword({
        email: parent.auth_user_email || `${parent.id}@parent.local`,
        password: passcode,
      });

      console.log("Auth result:", { session, sessionError });

      if (sessionError || !session) {
        if (sessionError?.message?.includes("fetch") || sessionError?.message?.includes("network")) {
          setError("网络连接失败，请检查网络后重试");
        } else {
          setError("登录失败，请重试");
        }
        setLoading(false);
        setLoadingStep("");
        return;
      }

      router.push("/dashboard");
    } catch (e) {
      console.error("Login error:", e);
      setError("登录出错，请重试");
      setLoading(false);
      setLoadingStep("");
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-forest-50 safe-area-pb">
      <div className="text-6xl mb-4">
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-16 h-16 mx-auto">
          <path d="M12 2C9.5 2 7.5 4 7 6.5C5.5 6.5 4 8 4 10c0 1.5.8 2.8 2 3.5-1 1-1.5 2.5-1.5 4C4.5 19 6 21 8 21c1 0 1.8-.5 2.3-1.2L10 22h4l-.3-2.2C14.2 20.5 15 21 16 21c2 0 3.5-2 3.5-3.5 0-1.5-.5-3-1.5-4 1.2-.7 2-2 2-3.5 0-2-1.5-3.5-3-3.5C16.5 4 14.5 2 12 2zM9 10c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1zm6 0c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1z"/>
        </svg>
      </div>
      <h1 className="text-3xl font-bold text-ink-800 mb-2">作业小管家</h1>
      <p className="text-ink-500 mb-8">家长请输入密码登录</p>

      <PasscodeInput
        onComplete={handlePasscodeComplete}
        error={error}
      />

      {loading && (
        <div className="mt-4 flex items-center gap-2">
          <svg className="animate-spin h-4 w-4 text-primary" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25" />
            <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          </svg>
          <p className="text-ink-500 text-sm">{loadingStep}</p>
        </div>
      )}
    </div>
  );
}
