"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { HomeworkAssignmentPanel } from "@/components/parent/HomeworkAssignmentPanel";
import { HomeworkRulePreview } from "@/components/parent/HomeworkRulePreview";
import {
  buildAssignmentSummary,
  buildHomeworkDraftFromSource,
  buildHomeworkInsertRows,
  buildHomeworkRulePreview,
  type HomeworkFormState,
} from "@/lib/homework-form";
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

const ALL_ICONS = ["📝", "✏️", "📋", "🎨", "⚽", "🏀", "🎸", "🧮", "🔬", "📐", "✍️", "🗣️", "🎹", "📖", "💻", "📚", "🔢", "🇨🇳", "🏐", "👯", "🎭", "🧹", "📸", "🎵", "🌟", "🧩", "🖊️", "📏", "🎯", "🏃"];

interface HomeworkFormProps {
  homework?: Database["public"]["Tables"]["homeworks"]["Row"];
  copyFromHomeworkId?: string;
  prefilledChildId?: string;
  onSuccess?: () => void;
}

export function HomeworkForm({
  homework,
  copyFromHomeworkId,
  prefilledChildId,
  onSuccess,
}: HomeworkFormProps) {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [children, setChildren] = useState<Child[]>([]);
  const [customTypes, setCustomTypes] = useState<CustomType[]>([]);
  const [loading, setLoading] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [hasLoadedCopySource, setHasLoadedCopySource] = useState(false);

  const isEditing = !!homework;

  const [formData, setFormData] = useState<HomeworkFormState>({
    child_ids: homework?.child_id ? [homework.child_id] : [],
    type_id: homework?.type_id || "",
    type_name: homework?.type_name || "",
    type_icon: homework?.type_icon || "📝",
    title: homework?.title || "",
    description: homework?.description || "",
    repeat_type: homework?.repeat_type || "daily",
    repeat_days: homework?.repeat_days || [],
    repeat_interval: homework?.repeat_interval || 1,
    repeat_start_date: homework?.repeat_start_date || "",
    point_value: homework?.point_value || 3,
    point_deduction: homework?.point_deduction ?? 3,
    estimated_minutes: homework?.estimated_minutes || 30,
    daily_cutoff_time: homework?.daily_cutoff_time || "23:30",
    required_checkpoint_type: homework?.required_checkpoint_type || "",
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

      // Only auto-select first child on initial load when editing a new homework
      if (!homework && !copyFromHomeworkId && childrenData?.length && !prefilledChildId) {
        setFormData((prev) => ({ ...prev, child_ids: [childrenData[0].id] }));
      }
    };

    fetchData();
    // Intentionally omits formData.child_ids to avoid re-fetching when selection changes.
  }, [supabase, copyFromHomeworkId, homework]);

  useEffect(() => {
    if (isEditing || !copyFromHomeworkId || hasLoadedCopySource) {
      return;
    }

    const fetchCopySource = async () => {
      const { data, error } = await supabase
        .from("homeworks")
        .select("*")
        .eq("id", copyFromHomeworkId)
        .maybeSingle();

      if (!error && data) {
        setFormData(buildHomeworkDraftFromSource(data));
      }

      setHasLoadedCopySource(true);
    };

    fetchCopySource();
  }, [copyFromHomeworkId, hasLoadedCopySource, isEditing, supabase]);

  useEffect(() => {
    if (prefilledChildId && !formData.child_ids.length && children.length > 0) {
      setFormData((prev) => ({ ...prev, child_ids: [prefilledChildId] }));
    }
    // Only runs when prefilledChildId changes or children first load.
    // Intentionally omits formData.child_ids from deps to avoid re-triggering.
  }, [prefilledChildId, children.length]);

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

  const selectedChildren = children.filter((child) =>
    formData.child_ids.includes(child.id)
  );
  const assignmentSummary = buildAssignmentSummary(selectedChildren);
  const preview = buildHomeworkRulePreview(formData, assignmentSummary.childNames);
  const canBatchAssign = !isEditing && !prefilledChildId;

  const handleTypeSelect = (type: (typeof allTypes)[0]) => {
    // Auto-fill title unless user has manually customized it
    const prevDefaultTitle = formData.type_name
      ? (() => {
          const found = DEFAULT_TYPES.find((t) => t.name === formData.type_name);
          if (found) return found.name + "练习";
          const custom = customTypes.find((t) => t.name === formData.type_name);
          if (custom) return custom.name + "练习";
        })()
      : null;
    // If no previous type, or current title matches previous default, it's auto-filled
    const isAutoTitle = !prevDefaultTitle || formData.title === prevDefaultTitle;

    setFormData((prev) => ({
      ...prev,
      type_id: type.is_custom ? type.id : "",
      type_name: type.name,
      type_icon: type.icon || "📝",
      point_value: type.default_points ?? 3,
      title: isAutoTitle ? type.name + "练习" : prev.title,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    const rows = buildHomeworkInsertRows(formData, session.user.id);

    if (homework) {
      await supabase.from("homeworks").update(rows[0]).eq("id", homework.id);
    } else {
      await supabase.from("homeworks").insert(rows);
    }

    setLoading(false);
    onSuccess?.();
    router.push("/homework");
  };

  const handleToggleChild = (childId: string) => {
    if (isEditing) {
      return;
    }

    setFormData((prev) => {
      const alreadySelected = prev.child_ids.includes(childId);
      const child_ids = alreadySelected
        ? prev.child_ids.filter((id) => id !== childId)
        : [...prev.child_ids, childId];

      // Always update, even if empty - user should be able to deselect all
      return {
        ...prev,
        child_ids,
      };
    });
  };

  const handleQuickTypeChange = (value: string) => {
    const matchedType = allTypes.find((type) => type.name === value);

    if (!matchedType) {
      setFormData((prev) => ({
        ...prev,
        type_id: "",
        type_name: "",
      }));
      return;
    }

    handleTypeSelect(matchedType);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4">
          <HomeworkAssignmentPanel
            children={children}
            selectedIds={formData.child_ids}
            canBatchAssign={canBatchAssign}
            createCountLabel={assignmentSummary.createCountLabel}
            independenceHint={assignmentSummary.independenceHint}
            onToggle={handleToggleChild}
          />
          <HomeworkRulePreview preview={preview} />
        </div>

        <div className="space-y-6 rounded-3xl border border-forest-200 bg-white/90 p-5">
          <div className="rounded-2xl border border-forest-200 bg-forest-50/70 p-4">
            <div className="flex-1">
              <label
                htmlFor="homework-quick-type"
                className="block text-sm font-medium text-forest-700"
              >
                快捷类型（可选）
              </label>
              <p className="mt-1 text-sm text-forest-500">
                选一个常用类型，自动带入标题建议、图标和默认积分。自定义类型请到设置页维护。
              </p>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <select
                id="homework-quick-type"
                aria-label="快捷类型（可选）"
                value={formData.type_name}
                onChange={(e) => handleQuickTypeChange(e.target.value)}
                className="w-full rounded-xl border-2 border-forest-200 bg-white px-4 py-3 text-sm text-forest-700 outline-none transition-all focus:border-primary"
              >
                <option value="">不预设类型</option>
                {allTypes.map((type) => (
                  <option key={type.id} value={type.name}>
                    {type.icon} {type.name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setShowIconPicker((prev) => !prev)}
                className="flex items-center justify-center gap-2 rounded-xl border border-forest-200 bg-white px-4 py-3 text-sm text-forest-600 transition-all hover:border-primary hover:text-primary"
              >
                图标 {formData.type_icon}
              </button>
            </div>

            {showIconPicker && (
              <div className="mt-3 flex flex-wrap gap-1">
                {ALL_ICONS.map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    onClick={() => {
                      setFormData((prev) => ({ ...prev, type_icon: icon }));
                      setShowIconPicker(false);
                    }}
                    className={`w-9 h-9 rounded-lg border-2 text-xl transition-all ${
                      formData.type_icon === icon
                        ? "border-primary bg-primary/10"
                        : "border-forest-200"
                    }`}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            )}
          </div>

          <Input
            label="作业标题"
            aria-label="作业标题"
            value={formData.title}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, title: e.target.value }))
            }
            placeholder={formData.type_name ? `${formData.type_name}练习` : "如：Khan Math Unit 3"}
            required
          />

          <div>
            <label className="mb-1 block text-sm font-medium text-forest-700">
              描述（可选）
            </label>
            <textarea
              aria-label="描述（可选）"
              value={formData.description}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, description: e.target.value }))
              }
              placeholder="详细说明..."
              className="w-full rounded-xl border-2 border-forest-200 px-4 py-2 focus:border-primary focus:outline-none"
              rows={3}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-forest-700">
              重复规则
            </label>
            <div className="flex gap-2 flex-wrap">
              {(["daily", "weekly", "interval", "once"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() =>
                    setFormData((prev) => ({ ...prev, repeat_type: type }))
                  }
                  className={`px-4 py-2 rounded-xl border-2 transition-all ${
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

          {formData.repeat_type === "weekly" && (
            <div>
              <label className="mb-2 block text-sm font-medium text-forest-700">
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
                    className={`w-10 h-10 rounded-full border-2 transition-all ${
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

          <div>
            <label className="mb-2 block text-sm font-medium text-forest-700">
              证明要求
            </label>
            <div className="flex gap-2">
              {([
                ["none", "无要求", "—"],
                ["photo", "照片", "📸"],
                ["audio", "录音", "🎵"],
              ] as const).map(([value, label, icon]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() =>
                    setFormData((prev) => ({
                      ...prev,
                      required_checkpoint_type: value === "none" ? "" : value,
                    }))
                  }
                  className={`flex-1 py-2 rounded-xl border-2 text-center transition-all ${
                    (value === "none" && !formData.required_checkpoint_type) ||
                    formData.required_checkpoint_type === value
                      ? "border-primary bg-primary/10"
                      : "border-forest-200 hover:border-forest-300"
                  }`}
                >
                  <span className="text-lg">{icon}</span>
                  <div className="text-xs">{label}</div>
                </button>
              ))}
            </div>
          </div>

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
              label="积分扣减（当日未完成）"
              type="number"
              min={0}
              max={20}
              value={formData.point_deduction}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  point_deduction: parseInt(e.target.value),
                }))
              }
            />
          </div>
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

          {formData.repeat_type === "interval" && (
            <Input
              label="每隔几天"
              type="number"
              min={1}
              max={30}
              value={formData.repeat_interval}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  repeat_interval: parseInt(e.target.value),
                }))
              }
            />
          )}

          {["interval", "once"].includes(formData.repeat_type) && (
            <Input
              label={formData.repeat_type === "once" ? "作业日期" : "开始日期"}
              type="date"
              value={formData.repeat_start_date}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  repeat_start_date: e.target.value,
                }))
              }
              required
            />
          )}

          <div className="flex gap-3">
            <Button type="button" variant="ghost" onClick={() => router.back()}>
              取消
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={loading || formData.child_ids.length === 0 || !formData.title}
            >
              {loading ? "保存中..." : homework ? "更新作业" : "创建作业"}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
