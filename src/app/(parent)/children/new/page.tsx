"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function NewChildPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    age: "",
    gender: "male" as "male" | "female",
    password: "",
    avatar: "🦊",
  });

  const avatars = ["🦊", "🐼", "🐨", "🦁", "🐯", "🐸", "🐰", "🐱", "🐶", "🦄"];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const res = await fetch("/api/children/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.name,
        age: formData.age,
        gender: formData.gender,
        password: formData.password,
        avatar: formData.avatar,
      }),
    });

    const result = await res.json();

    if (!res.ok) {
      alert(result.error || "创建失败，请重试");
      setLoading(false);
      return;
    }

    setLoading(false);
    router.push("/children");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary text-white p-4">
        <div className="max-w-md mx-auto">
          <h1 className="text-xl font-bold">添加孩子</h1>
        </div>
      </header>

      <main className="max-w-md mx-auto p-4">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Avatar selector */}
          <div>
            <label className="block text-sm font-medium text-forest-700 mb-2">
              选择头像
            </label>
            <div className="flex gap-2 flex-wrap">
              {avatars.map((avatar) => (
                <button
                  key={avatar}
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, avatar }))}
                  className={`w-12 h-12 text-2xl rounded-xl border-2 transition-all
                    ${
                      formData.avatar === avatar
                        ? "border-primary bg-primary/10"
                        : "border-forest-200"
                    }`}
                >
                  {avatar}
                </button>
              ))}
            </div>
          </div>

          <Input
            label="姓名"
            value={formData.name}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, name: e.target.value }))
            }
            required
          />

          <Input
            label="年龄"
            type="number"
            min={5}
            max={18}
            value={formData.age}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, age: e.target.value }))
            }
            required
          />

          <div>
            <label className="block text-sm font-medium text-forest-700 mb-2">
              性别
            </label>
            <div className="flex gap-4">
              {(["male", "female"] as const).map((gender) => (
                <button
                  key={gender}
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, gender }))}
                  className={`flex-1 py-2 rounded-xl border-2 transition-all
                    ${
                      formData.gender === gender
                        ? "border-primary bg-primary/10"
                        : "border-forest-200"
                    }`}
                >
                  {gender === "male" ? "男孩" : "女孩"}
                </button>
              ))}
            </div>
          </div>

          <Input
            label="登录密码"
            type="password"
            value={formData.password}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, password: e.target.value }))
            }
            placeholder="孩子登录时使用的密码"
            required
          />

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "创建中..." : "创建"}
          </Button>
        </form>
      </main>
    </div>
  );
}