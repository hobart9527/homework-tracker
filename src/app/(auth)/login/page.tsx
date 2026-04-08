"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PasscodeInput } from "@/components/ui/PasscodeInput";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";

export default function ParentLoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const handlePasscodeComplete = async (passcode: string) => {
    setLoading(true);
    setError("");

    // First check if parent exists with this passcode
    const { data: parent, error: findError } = await supabase
      .from("parents")
      .select("*")
      .eq("passcode", passcode)
      .single();

    if (findError || !parent) {
      setError("密码错误，请重试");
      setLoading(false);
      return;
    }

    // Set session for parent
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.signInWithPassword({
      email: parent.id, // Using ID as email placeholder
      password: passcode,
    });

    if (sessionError || !session) {
      setError("登录失败，请重试");
      setLoading(false);
      return;
    }

    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-b from-forest-100 to-forest-50">
      <div className="text-6xl mb-4">🦊</div>
      <h1 className="text-3xl font-bold text-forest-700 mb-2">作业小管家</h1>
      <p className="text-forest-500 mb-8">家长请输入密码登录</p>

      <PasscodeInput
        onComplete={handlePasscodeComplete}
        error={error}
      />

      {loading && (
        <p className="text-forest-500 mt-4">登录中...</p>
      )}
    </div>
  );
}
