"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

type EnglishStandard = {
  razLevel: string;
  wordCountMin: number;
  wordCountMax: number;
  wpm: number;
  lexileScore: number;
};

type ChineseStandard = {
  charCountMin: number;
  charCountMax: number;
  wpm: number;
};

type StandardsData = {
  _meta?: { lastUpdated?: string; version?: string };
  english: Record<string, EnglishStandard>;
  chinese: Record<string, ChineseStandard>;
};

const ENGLISH_DEFAULTS: Record<string, EnglishStandard> = {
  "1": { razLevel: "C-E", wordCountMin: 50,   wordCountMax: 180,  wpm: 45,  lexileScore: 200  },
  "2": { razLevel: "F-H", wordCountMin: 130,  wordCountMax: 340,  wpm: 75,  lexileScore: 450  },
  "3": { razLevel: "I-K", wordCountMin: 350,  wordCountMax: 550,  wpm: 105, lexileScore: 700  },
  "4": { razLevel: "L-N", wordCountMin: 450,  wordCountMax: 820,  wpm: 135, lexileScore: 1000 },
  "5": { razLevel: "O-Q", wordCountMin: 680,  wordCountMax: 1180, wpm: 165, lexileScore: 1300 },
  "6": { razLevel: "R-T", wordCountMin: 940,  wordCountMax: 1590, wpm: 190, lexileScore: 1700 },
  "7": { razLevel: "U-W", wordCountMin: 1260, wordCountMax: 2080, wpm: 210, lexileScore: 2000 },
  "8": { razLevel: "X-Z", wordCountMin: 1650, wordCountMax: 2700, wpm: 220, lexileScore: 2300 },
};

const CHINESE_DEFAULTS: Record<string, ChineseStandard> = {
  "1": { charCountMin: 50,   charCountMax: 200,  wpm: 50  },
  "2": { charCountMin: 100,  charCountMax: 400,  wpm: 70  },
  "3": { charCountMin: 200,  charCountMax: 600,  wpm: 90  },
  "4": { charCountMin: 300,  charCountMax: 800,  wpm: 110 },
  "5": { charCountMin: 400,  charCountMax: 1000, wpm: 135 },
  "6": { charCountMin: 500,  charCountMax: 1200, wpm: 165 },
  "7": { charCountMin: 600,  charCountMax: 1500, wpm: 180 },
  "8": { charCountMin: 800,  charCountMax: 2000, wpm: 200 },
};

type ToastKind = "success" | "error" | "info" | null;

export default function ReadingStandardsPage() {
  const [standards, setStandards] = useState<StandardsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [activeTab, setActiveTab] = useState<"en" | "zh">("en");
  const [toast, setToast] = useState<{ kind: ToastKind; message: string }>({ kind: null, message: "" });
  const [dirty, setDirty] = useState(false);

  const showToast = useCallback((kind: ToastKind, message: string) => {
    setToast({ kind, message });
    setTimeout(() => setToast({ kind: null, message: "" }), 4000);
  }, []);

  // Load current standards
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/admin/reading-standards", {
          headers: { "x-admin-secret": process.env.NEXT_PUBLIC_ADMIN_SECRET || "" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: StandardsData = await res.json();
        setStandards(data);
      } catch (err) {
        showToast("error", "读取配置失败，请检查环境变量");
        setStandards({ english: ENGLISH_DEFAULTS, chinese: CHINESE_DEFAULTS });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [showToast]);

  const handleChange = (
    lang: "en" | "zh",
    grade: string,
    field: "wordCountMin" | "wordCountMax" | "wpm" | "lexileScore" | "charCountMin" | "charCountMax",
    value: string
  ) => {
    if (!standards) return;
    const num = parseInt(value, 10);
    if (isNaN(num)) return;

    setStandards((prev) => {
      if (!prev) return prev;
      const clone = JSON.parse(JSON.stringify(prev)) as StandardsData;
      if (lang === "en") {
        const std = (clone.english as Record<string, EnglishStandard>)[grade];
        if (field === "wordCountMin") std.wordCountMin = num;
        else if (field === "wordCountMax") std.wordCountMax = num;
        else if (field === "wpm") std.wpm = num;
        else if (field === "lexileScore") std.lexileScore = num;
      } else {
        const std = (clone.chinese as Record<string, ChineseStandard>)[grade];
        if (field === "charCountMin") std.charCountMin = num;
        else if (field === "charCountMax") std.charCountMax = num;
        else if (field === "wpm") std.wpm = num;
      }
      return clone;
    });
    setDirty(true);
  };

  const handleRazLevelChange = (grade: string, value: string) => {
    if (!standards) return;
    setStandards((prev) => {
      if (!prev) return prev;
      const clone = JSON.parse(JSON.stringify(prev));
      clone.english[grade].razLevel = value;
      return clone;
    });
    setDirty(true);
  };

  const handleSave = async () => {
    if (!standards) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/reading-standards", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": process.env.NEXT_PUBLIC_ADMIN_SECRET || "",
        },
        body: JSON.stringify(standards),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDirty(false);
      showToast("success", "保存成功");
    } catch (err) {
      showToast("error", "保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async (lang: "en" | "zh") => {
    if (!standards) return;
    setResetting(true);
    try {
      const defaults = lang === "en" ? ENGLISH_DEFAULTS : CHINESE_DEFAULTS;
      const clone = JSON.parse(JSON.stringify(standards));
      clone[lang === "en" ? "english" : "chinese"] = JSON.parse(JSON.stringify(defaults));
      setStandards(clone);
      setDirty(true);
      showToast("info", `已重置 ${lang === "en" ? "英文" : "中文"} 标准为默认值`);
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="bg-forest-500 p-space-4 text-white">
          <div className="mx-auto flex max-w-3xl items-center gap-4">
            <Link href="/settings">
              <span className="text-xl">←</span>
            </Link>
            <div>
              <h1 className="text-ui-xl font-ui-display font-bold">阅读标准</h1>
              <p className="mt-1 text-ui-sm text-white/80">管理年级阅读能力标准</p>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-3xl p-space-4">
          <div className="flex items-center justify-center py-20 text-forest-600">
            加载中...
          </div>
        </main>
      </div>
    );
  }

  if (!standards) {
    return (
      <div className="min-h-screen bg-background">
        <header className="bg-forest-500 p-space-4 text-white">
          <div className="mx-auto flex max-w-3xl items-center gap-4">
            <Link href="/settings">
              <span className="text-xl">←</span>
            </Link>
            <div>
              <h1 className="text-ui-xl font-ui-display font-bold">阅读标准</h1>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-3xl p-space-4">
          <Card>
            <p className="text-coral-600">加载失败，请检查配置。</p>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-forest-500 p-space-4 text-white">
        <div className="mx-auto flex max-w-3xl items-center gap-4">
          <Link href="/settings">
            <span className="text-xl">←</span>
          </Link>
          <div>
            <h1 className="text-ui-xl font-ui-display font-bold">阅读标准</h1>
            <p className="mt-1 text-ui-sm text-white/80">
              管理年级阅读能力标准 · 字数范围与阅读速度
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 p-space-4">
        {/* Meta info */}
        {standards._meta?.lastUpdated && (
          <p className="text-ui-xs text-ink-500">
            上次更新：{standards._meta.lastUpdated} · 版本 {standards._meta.version || "1.0"}
          </p>
        )}

        {/* Tab switcher */}
        <div className="flex gap-1 rounded-radius-md bg-forest-50 p-1">
          <button
            onClick={() => setActiveTab("en")}
            className={`flex-1 rounded-radius-sm px-4 py-2 text-ui-sm font-medium transition-colors ${
              activeTab === "en"
                ? "bg-white text-forest-700 shadow-elevation-raised"
                : "text-forest-600 hover:text-forest-800"
            }`}
          >
            英文标准 (English)
          </button>
          <button
            onClick={() => setActiveTab("zh")}
            className={`flex-1 rounded-radius-sm px-4 py-2 text-ui-sm font-medium transition-colors ${
              activeTab === "zh"
                ? "bg-white text-forest-700 shadow-elevation-raised"
                : "text-forest-600 hover:text-forest-800"
            }`}
          >
            中文标准 (中文)
          </button>
        </div>

        {/* English table */}
        {activeTab === "en" && (
          <Card>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-forest-700">英文阅读标准</h2>
                <button
                  onClick={() => handleReset("en")}
                  disabled={resetting}
                  className="text-ui-sm text-ink-500 underline hover:text-ink-700"
                >
                  {resetting ? "重置中..." : "重置为默认"}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-ui-sm">
                  <thead>
                    <tr className="border-b border-forest-100 text-left text-forest-600">
                      <th className="pb-2 pr-3 font-medium">年级</th>
                      <th className="pb-2 pr-3 font-medium">RAZ Level</th>
                      <th className="pb-2 pr-3 font-medium">字数下限</th>
                      <th className="pb-2 pr-3 font-medium">字数上限</th>
                      <th className="pb-2 pr-3 font-medium">WPM</th>
                      <th className="pb-2 font-medium">Lexile</th>
                    </tr>
                  </thead>
                  <tbody>
                    {["1", "2", "3", "4", "5", "6", "7", "8"].map((g) => {
                      const std = standards.english[g];
                      return (
                        <tr key={g} className="border-b border-forest-50 last:border-0">
                          <td className="py-2 pr-3 font-medium text-forest-700">Grade {g}</td>
                          <td className="py-2 pr-3">
                            <input
                              type="text"
                              value={std.razLevel}
                              onChange={(e) => handleRazLevelChange(g, e.target.value)}
                              className="w-16 rounded-radius-sm border border-forest-200 bg-white px-2 py-1 text-center text-ui-sm"
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <input
                              type="number"
                              value={std.wordCountMin}
                              onChange={(e) => handleChange("en", g, "wordCountMin", e.target.value)}
                              className="w-20 rounded-radius-sm border border-forest-200 bg-white px-2 py-1 text-ui-sm"
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <input
                              type="number"
                              value={std.wordCountMax}
                              onChange={(e) => handleChange("en", g, "wordCountMax", e.target.value)}
                              className="w-20 rounded-radius-sm border border-forest-200 bg-white px-2 py-1 text-ui-sm"
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <input
                              type="number"
                              value={std.wpm}
                              onChange={(e) => handleChange("en", g, "wpm", e.target.value)}
                              className="w-16 rounded-radius-sm border border-forest-200 bg-white px-2 py-1 text-ui-sm"
                            />
                          </td>
                          <td className="py-2">
                            <input
                              type="number"
                              value={std.lexileScore}
                              onChange={(e) => handleChange("en", g, "lexileScore", e.target.value)}
                              className="w-20 rounded-radius-sm border border-forest-200 bg-white px-2 py-1 text-ui-sm"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        )}

        {/* Chinese table */}
        {activeTab === "zh" && (
          <Card>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-forest-700">中文阅读标准</h2>
                <button
                  onClick={() => handleReset("zh")}
                  disabled={resetting}
                  className="text-ui-sm text-ink-500 underline hover:text-ink-700"
                >
                  {resetting ? "重置中..." : "重置为默认"}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-ui-sm">
                  <thead>
                    <tr className="border-b border-forest-100 text-left text-forest-600">
                      <th className="pb-2 pr-3 font-medium">年级</th>
                      <th className="pb-2 pr-3 font-medium">字数下限</th>
                      <th className="pb-2 pr-3 font-medium">字数上限</th>
                      <th className="pb-2 font-medium">WPM (字/分钟)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {["1", "2", "3", "4", "5", "6", "7", "8"].map((g) => {
                      const std = standards.chinese[g];
                      return (
                        <tr key={g} className="border-b border-forest-50 last:border-0">
                          <td className="py-2 pr-3 font-medium text-forest-700">Grade {g}</td>
                          <td className="py-2 pr-3">
                            <input
                              type="number"
                              value={std.charCountMin}
                              onChange={(e) => handleChange("zh", g, "charCountMin", e.target.value)}
                              className="w-20 rounded-radius-sm border border-forest-200 bg-white px-2 py-1 text-ui-sm"
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <input
                              type="number"
                              value={std.charCountMax}
                              onChange={(e) => handleChange("zh", g, "charCountMax", e.target.value)}
                              className="w-20 rounded-radius-sm border border-forest-200 bg-white px-2 py-1 text-ui-sm"
                            />
                          </td>
                          <td className="py-2">
                            <input
                              type="number"
                              value={std.wpm}
                              onChange={(e) => handleChange("zh", g, "wpm", e.target.value)}
                              className="w-20 rounded-radius-sm border border-forest-200 bg-white px-2 py-1 text-ui-sm"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              size="md"
              disabled={!dirty || saving}
              onClick={handleSave}
            >
              {saving ? "保存中..." : "保存修改"}
            </Button>
            {dirty && (
              <span className="text-ui-sm text-ink-500">有未保存的更改</span>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.location.href = "/settings"}
          >
            返回设置
          </Button>
        </div>

        {/* Toast */}
        {toast.kind && (
          <div
            className={`fixed bottom-6 right-6 rounded-radius-lg px-4 py-3 shadow-elevation-floating ${
              toast.kind === "success"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : toast.kind === "error"
                ? "bg-coral-50 text-coral-700 border border-coral-200"
                : "bg-forest-50 text-forest-700 border border-forest-200"
            }`}
          >
            <p className="text-ui-sm font-medium">{toast.message}</p>
          </div>
        )}
      </main>
    </div>
  );
}