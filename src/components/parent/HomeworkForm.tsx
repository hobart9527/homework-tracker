"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { Database } from "@/lib/supabase/types";

type Child = Database["public"]["Tables"]["children"]["Row"];
type CustomType = Database["public"]["Tables"]["custom_homework_types"]["Row"];

const DEFAULT_TYPES = [
  { id: "piano", name: "钢琴", icon: "🎹", default_points: 6 },
  { id: "reading", name: "阅读", icon: "📖", default_points: 3 },
  { id: "khan", name: "Khan Academy", icon: "💻", default_points: 4 },
  { id: "raz", name: "Raz-Kidz", icon: "📚", default_points: 3 },
  { id: "ixl", name: "IXL", icon: "🔢", default_points: 4 },
  { id: "chinese", name: "中文", icon: "🇨🇳", default_points: 3 },
  { id: "volleyball", name: "排球", icon: "🏐", default_points: 3 },
  { id: "ballet", name: "Ballet", icon: "👯", default_points: 3 },
  { id: "musical", name: "Musical", icon: "🎭", default_points: 3 },
  { id: "housework", name: "家务", icon: "🧹", default_points: 2 },
];

interface HomeworkFormProps {
  homework?: Database["public"]["Tables"]["homeworks"]["Row"];
  onSuccess?: () => void;
}

export function HomeworkForm({ homework, onSuccess }: HomeworkFormProps) {
  const router = useRouter();
  const supabase = createClient();
  const [children, setChildren] = useState<Child[]>([]);
  const [customTypes, setCustomTypes] = useState<CustomType[]>([]);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    child_id: homework?.child_id || "",
    type_id: homework?.type_id || "",
    type_name: homework?.type_name || "",
    type_icon: homework?.type_icon || "",
    title: homework?.title || "",
    description: homework?.description || "",
    repeat_type: homework?.repeat_type || "daily",
    repeat_days: homework?.repeat_days || [],
    repeat_interval: homework?.repeat_interval || 1,
    repeat_start_date: homework?.repeat_start_date || "",
    point_value: homework?.point_value || 3,
    estimated_minutes: homework?.estimated_minutes || 30,
    daily_cutoff_time: homework?.daily_cutoff_time || "20:00",
  });

  useEffect(() => {
    const fetchData = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const [{ data: childrenData }, { data: customTypesData }] =
        await Promise.all([
          supabase.from("children").select("*").eq("parent_id", session.user.id),
          supabase
            .from("custom_homework_types")
            .select("*")
            .eq("parent_id", session.user.id),
        ]);

      if (childrenData) setChildren(childrenData);
      if (customTypesData) setCustomTypes(customTypesData);

      if (!formData.child_id && childrenData?.length) {
        setFormData((prev) => ({ ...prev, child_id: childrenData[0].id }));
      }
    };

    fetchData();
  }, [supabase, formData.child_id]);

  const allTypes = [
    ...DEFAULT_TYPES.map((t) => ({ ...t, is_custom: false })),
    ...customTypes.map((t) => ({
      id: t.id,
      name: t.name,
      icon: t.icon,
      default_points: t.default_points,
      is_custom: true,
    })),
  ];

  const handleTypeSelect = (type: (typeof allTypes)[0]) => {
    setFormData((prev) => ({
      ...prev,
      type_id: type.is_custom ? type.id : "",
      type_name: type.name,
      type_icon: type.icon,
      point_value: type.default_points,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    const homeworkData = {
      child_id: formData.child_id,
      type_id: formData.type_id || null,
      type_name: formData.type_name,
      type_icon: formData.type_icon,
      title: formData.title,
      description: formData.description || null,
      repeat_type: formData.repeat_type,
      repeat_days:
        formData.repeat_type === "weekly" ? formData.repeat_days : null,
      repeat_interval:
        formData.repeat_type === "interval" ? formData.repeat_interval : null,
      repeat_start_date: formData.repeat_start_date || null,
      point_value: formData.point_value,
      estimated_minutes: formData.estimated_minutes,
      daily_cutoff_time: formData.daily_cutoff_time || null,
      created_by: session.user.id,
    };

    if (homework) {
      await supabase.from("homeworks").update(homeworkData).eq("id", homework.id);
    } else {
      await supabase.from("homeworks").insert(homeworkData);
    }

    setLoading(false);
    onSuccess?.();
    router.push("/homework");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Child selector */}
      <div>
        <label className="block text-sm font-medium text-forest-700 mb-2">
          孩子
        </label>
        <div className="flex gap-2">
          {children.map((child) => (
            <button
              key={child.id}
              type="button"
              onClick={() =>
                setFormData((prev) => ({ ...prev, child_id: child.id }))
              }
              className={`flex-1 px-4 py-2 rounded-xl border-2 transition-all
                ${
                  formData.child_id === child.id
                    ? "border-primary bg-primary/10"
                    : "border-forest-200"
                }`}
            >
              {child.avatar} {child.name}
            </button>
          ))}
        </div>
      </div>

      {/* Homework type */}
      <div>
        <label className="block text-sm font-medium text-forest-700 mb-2">
          作业类型
        </label>
        <div className="grid grid-cols-5 gap-2">
          {allTypes.map((type) => (
            <button
              key={type.id}
              type="button"
              onClick={() => handleTypeSelect(type)}
              className={`p-3 rounded-xl border-2 text-center transition-all
                ${
                  formData.type_name === type.name
                    ? "border-primary bg-primary/10"
                    : "border-forest-200 hover:border-forest-300"
                }`}
            >
              <div className="text-2xl">{type.icon}</div>
              <div className="text-xs mt-1 truncate">{type.name}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Title */}
      <Input
        label="作业标题"
        value={formData.title}
        onChange={(e) =>
          setFormData((prev) => ({ ...prev, title: e.target.value }))
        }
        placeholder="如：Khan Math Unit 3"
        required
      />

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-forest-700 mb-1">
          描述（可选）
        </label>
        <textarea
          value={formData.description}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, description: e.target.value }))
          }
          placeholder="详细说明..."
          className="w-full px-4 py-2 rounded-xl border-2 border-forest-200 focus:border-primary focus:outline-none"
          rows={3}
        />
      </div>

      {/* Repeat rule */}
      <div>
        <label className="block text-sm font-medium text-forest-700 mb-2">
          重复规则
        </label>
        <div className="flex gap-2 flex-wrap">
          {["daily", "weekly", "interval", "once"].map((type) => (
            <button
              key={type}
              type="button"
              onClick={() =>
                setFormData((prev) => ({ ...prev, repeat_type: type }))
              }
              className={`px-4 py-2 rounded-xl border-2 transition-all
                ${
                  formData.repeat_type === type
                    ? "border-primary bg-primary/10"
                    : "border-forest-200"
                }`}
            >
              {{
                daily: "每日",
                weekly: "每周",
                interval: "间隔",
                once: "单次",
              }[type]}
            </button>
          ))}
        </div>
      </div>

      {/* Weekly days selector */}
      {formData.repeat_type === "weekly" && (
        <div>
          <label className="block text-sm font-medium text-forest-700 mb-2">
            选择星期
          </label>
          <div className="flex gap-2">
            {["日", "一", "二", "三", "四", "五", "六"].map((day, index) => (
              <button
                key={day}
                type="button"
                onClick={() => {
                  const days = formData.repeat_days.includes(index)
                    ? formData.repeat_days.filter((d) => d !== index)
                    : [...formData.repeat_days, index];
                  setFormData((prev) => ({ ...prev, repeat_days: days }));
                }}
                className={`w-10 h-10 rounded-full border-2 transition-all
                  ${
                    formData.repeat_days.includes(index)
                      ? "border-primary bg-primary text-white"
                      : "border-forest-200"
                  }`}
              >
                {day}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Points and duration */}
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="积分奖励"
          type="number"
          min={1}
          max={20}
          value={formData.point_value}
          onChange={(e) =>
            setFormData((prev) => ({
              ...prev,
              point_value: parseInt(e.target.value),
            }))
          }
        />
        <Input
          label="预计时长（分钟）"
          type="number"
          min={5}
          max={180}
          value={formData.estimated_minutes}
          onChange={(e) =>
            setFormData((prev) => ({
              ...prev,
              estimated_minutes: parseInt(e.target.value),
            }))
          }
        />
      </div>

      {/* Daily cutoff time */}
      <Input
        label="每日截止时间"
        type="time"
        value={formData.daily_cutoff_time}
        onChange={(e) =>
          setFormData((prev) => ({
            ...prev,
            daily_cutoff_time: e.target.value,
          }))
        }
      />

      {/* Submit */}
      <div className="flex gap-3">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          取消
        </Button>
        <Button type="submit" className="flex-1" disabled={loading}>
          {loading ? "保存中..." : homework ? "更新作业" : "创建作业"}
        </Button>
      </div>
    </form>
  );
}