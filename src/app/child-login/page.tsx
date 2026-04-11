"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PasscodeInput } from "@/components/ui/PasscodeInput";
import { createClient } from "@/lib/supabase/client";

export default function ChildLoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [childName, setChildName] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handlePasscodeComplete = async (passcode: string) => {
    setLoading(true);
    setError("");

    // Look up child by name
    const { data: children, error: findError } = await supabase.rpc(
      "get_child_by_name",
      { name_param: childName.trim() }
    );

    const child = children?.[0];
    if (!child || findError) {
      setError("找不到孩子，请先添加孩子");
      setLoading(false);
      return;
    }

    // Verify password - check both password_hash field and actual auth
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.signInWithPassword({
      email: `${child.id}@child.local`,
      password: passcode,
    });

    if (sessionError || !session) {
      setError("密码错误，请重试");
      setLoading(false);
      return;
    }

    router.push("/today");
  };

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (childName.trim()) {
      setShowPassword(true);
      setError("");
    }
  };

  if (!showPassword) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-b from-blue-100 to-blue-50">
        <div className="text-6xl mb-4">🧒</div>
        <h1 className="text-3xl font-bold text-forest-700 mb-2">作业小管家</h1>
        <p className="text-forest-500 mb-8">小朋友，你的名字是？</p>

        <form onSubmit={handleNameSubmit} className="w-full max-w-sm">
          <div className="flex flex-col gap-3">
            <input
              type="text"
              value={childName}
              onChange={(e) => setChildName(e.target.value)}
              placeholder="输入你的名字"
              className="w-full px-6 py-3 text-center text-xl rounded-2xl border-2 border-forest-200 focus:border-primary focus:outline-none"
              autoFocus
            />
            <button
              type="submit"
              disabled={!childName.trim()}
              className="w-full py-3 bg-primary text-white text-xl font-bold rounded-2xl disabled:opacity-50"
            >
              下一步
            </button>
            <p className="text-center text-sm text-forest-400 mt-4">
              家长？<a href="/login" className="text-primary underline">家长登录</a>
            </p>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-b from-blue-100 to-blue-50">
      <div className="text-6xl mb-4">🧒</div>
      <h1 className="text-3xl font-bold text-forest-700 mb-2">你好，{childName}！</h1>
      <p className="text-forest-500 mb-8">输入你的密码</p>

      <PasscodeInput
        onComplete={handlePasscodeComplete}
        error={error}
      />

      {loading && (
        <p className="text-forest-500 mt-4">登录中...</p>
      )}

      <p className="text-center text-sm text-forest-400 mt-8">
        家长？<a href="/login" className="text-primary underline">家长登录</a>
      </p>
    </div>
  );
}
