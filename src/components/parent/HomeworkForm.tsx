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
type PlatformAccount = Database["public"]["Tables"]["platform_accounts"]["Row"];
type MessageRoutingRule =
  Database["public"]["Tables"]["message_routing_rules"]["Row"];
type WeChatGroup = Database["public"]["Tables"]["wechat_groups"]["Row"];

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
  const [platformAccounts, setPlatformAccounts] = useState<PlatformAccount[]>([]);
  const [routingRules, setRoutingRules] = useState<MessageRoutingRule[]>([]);
  const [wechatGroups, setWechatGroups] = useState<WeChatGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [hasLoadedCopySource, setHasLoadedCopySource] = useState(false);
  const [homeworkRoutingMode, setHomeworkRoutingMode] = useState<
    "child_default" | "homework_override"
  >("child_default");
  const [homeworkRoutingForm, setHomeworkRoutingForm] = useState({
    channel: "wechat_group" as "telegram_chat" | "wechat_group",
    recipientRef: "",
    recipientLabel: "",
  });

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
    estimated_minutes: homework?.estimated_minutes ?? null,
    daily_cutoff_time: homework?.daily_cutoff_time || "23:30",
    required_checkpoint_type: homework?.required_checkpoint_type || "",
    platform_binding_platform: homework?.platform_binding_platform || "",
    platform_binding_source_ref: homework?.platform_binding_source_ref || "",
    send_to_wechat: homework?.send_to_wechat || false,
    wechat_group_id: homework?.wechat_group_id || "",
  });

  useEffect(() => {
    const fetchData = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const { data: childrenData } = await supabase
        .from("children")
        .select("*")
        .eq("parent_id", session.user.id);

      if (childrenData) setChildren(childrenData);

      if (childrenData?.length) {
        const childIds = childrenData.map((child) => child.id);
        const [
          { data: platformAccountsData },
          { data: routingRulesData },
          { data: wechatGroupsData },
        ] =
          await Promise.all([
            supabase
              .from("platform_accounts")
              .select("*")
              .in("child_id", childIds),
            supabase
              .from("message_routing_rules")
              .select("*")
              .in("child_id", childIds)
              .order("created_at", { ascending: false }),
            supabase.from("wechat_groups").select("*").eq("parent_id", session.user.id),
          ]);

        if (platformAccountsData) {
          setPlatformAccounts(platformAccountsData as PlatformAccount[]);
        }
        if (routingRulesData) {
          setRoutingRules(routingRulesData as MessageRoutingRule[]);
        }
        if (wechatGroupsData) {
          setWechatGroups(wechatGroupsData as WeChatGroup[]);
        }
      }

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

  useEffect(() => {
    if (!homework?.id) {
      return;
    }

    const existingHomeworkRoute = routingRules.find(
      (rule) => rule.homework_id === homework.id
    );

    if (!existingHomeworkRoute) {
      setHomeworkRoutingMode("child_default");
      setHomeworkRoutingForm({
        channel: "wechat_group",
        recipientRef: "",
        recipientLabel: "",
      });
      return;
    }

    setHomeworkRoutingMode("homework_override");
    setHomeworkRoutingForm({
      channel: "wechat_group",
      recipientRef: existingHomeworkRoute.recipient_ref,
      recipientLabel: existingHomeworkRoute.recipient_label || "",
    });
  }, [homework?.id, routingRules]);

  const allTypes = DEFAULT_TYPES.map((t) => ({ ...t, is_custom: false }));

  const selectedChildren = children.filter((child) =>
    formData.child_ids.includes(child.id)
  );
  const canConfigurePlatformBinding = formData.child_ids.length === 1;
  const selectedChildId = canConfigurePlatformBinding ? formData.child_ids[0] : null;
  const autoMatchedPlatform = (() => {
    const normalizedType = formData.type_name.trim().toLowerCase();
    if (normalizedType === "ixl") {
      return "ixl";
    }
    if (normalizedType === "khan academy" || normalizedType === "khan") {
      return "khan-academy";
    }
    return "";
  })();
  const selectedChildPlatformAccounts = platformAccounts.filter(
    (account) => account.child_id === selectedChildId
  );
  const selectedChild = children.find((child) => child.id === selectedChildId) ?? null;
  const selectedChildDefaultGroup = selectedChild?.default_wechat_group_id
    ? wechatGroups.find((group) => group.id === selectedChild.default_wechat_group_id) ?? null
    : null;
  const matchedPlatformAccount = selectedChildPlatformAccounts.find(
    (account) => account.platform === formData.platform_binding_platform
  );
  const routeSuggestions = routingRules.filter(
    (rule) =>
      rule.child_id === selectedChildId &&
      rule.channel === "wechat_group" &&
      (rule.homework_id === null || rule.homework_id === homework?.id)
  );
  const assignmentSummary = buildAssignmentSummary(selectedChildren);
  const preview = buildHomeworkRulePreview(formData, assignmentSummary.childNames);
  const canBatchAssign = !isEditing && !prefilledChildId;

  useEffect(() => {
    if (!autoMatchedPlatform || !canConfigurePlatformBinding) {
      return;
    }

    setFormData((prev) => {
      if (prev.platform_binding_platform === autoMatchedPlatform) {
        return prev;
      }

      return {
        ...prev,
        platform_binding_platform: autoMatchedPlatform,
      };
    });
  }, [autoMatchedPlatform, canConfigurePlatformBinding]);

  const handleTypeSelect = (type: (typeof allTypes)[0]) => {
    // Auto-fill title unless user has manually customized it
    const prevDefaultTitle = formData.type_name
      ? (() => {
          const found = DEFAULT_TYPES.find((t) => t.name === formData.type_name);
          if (found) return found.name + "练习";
        })()
      : null;
    // If no previous type, or current title matches previous default, it's auto-filled
    const isAutoTitle = !prevDefaultTitle || formData.title === prevDefaultTitle;

    setFormData((prev) => ({
      ...prev,
      type_id: "",
      type_name: type.name,
      type_icon: type.icon || "📝",
      point_value: type.default_points ?? 3,
      title: isAutoTitle ? type.name + "练习" : prev.title,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }

      const rows = buildHomeworkInsertRows(formData, session.user.id);
      let savedHomeworkId = homework?.id ?? null;

      if (homework) {
        const { error } = await supabase
          .from("homeworks")
          .update(rows[0])
          .eq("id", homework.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("homeworks")
          .insert(rows)
          .select("id");
        if (error) throw error;
        if (data?.length) {
          savedHomeworkId = data[0].id;
        }
      }

      if (savedHomeworkId && selectedChildId && canConfigurePlatformBinding) {
        const existingHomeworkRoutes = routingRules.filter(
          (rule) => rule.homework_id === savedHomeworkId
        );

        if (homeworkRoutingMode === "child_default") {
          for (const rule of existingHomeworkRoutes) {
            await supabase
              .from("message_routing_rules")
              .delete()
              .eq("id", rule.id);
          }
        } else if (homeworkRoutingForm.recipientRef.trim()) {
          if (existingHomeworkRoutes.length) {
            await supabase
              .from("message_routing_rules")
              .update({
                channel: homeworkRoutingForm.channel,
                recipient_ref: homeworkRoutingForm.recipientRef.trim(),
                recipient_label:
                  homeworkRoutingForm.recipientLabel.trim() || null,
              })
              .eq("id", existingHomeworkRoutes[0].id);

            for (const redundantRule of existingHomeworkRoutes.slice(1)) {
              await supabase
                .from("message_routing_rules")
                .delete()
                .eq("id", redundantRule.id);
            }
          } else {
            await supabase.from("message_routing_rules").insert({
              child_id: selectedChildId,
              homework_id: savedHomeworkId,
              channel: homeworkRoutingForm.channel,
              recipient_ref: homeworkRoutingForm.recipientRef.trim(),
              recipient_label:
                homeworkRoutingForm.recipientLabel.trim() || null,
            });
          }
        }
      }

      setLoading(false);
      onSuccess?.();
      router.push("/homework");
    } catch (err: any) {
      setLoading(false);
      console.error("Failed to save homework:", err);
      const msg =
        err?.message || err?.error_description || JSON.stringify(err);
      alert(`保存作业失败: ${msg}`);
    }
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
            value={formData.estimated_minutes ?? ""}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                estimated_minutes:
                  e.target.value.trim() === ""
                    ? null
                    : parseInt(e.target.value, 10),
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

          <div className="rounded-2xl border border-forest-200 bg-forest-50/70 p-4">
            <div>
              <label className="block text-sm font-medium text-forest-700">
                平台任务绑定
              </label>
              <p className="mt-1 text-sm text-forest-500">
                绑定后，平台同步会优先把学习事件匹配到这条作业。适合单个孩子的精确任务；多人批量创建时先保持为空更稳妥。
              </p>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="platform-binding-platform"
                  className="mb-1 block text-sm font-medium text-forest-700"
                >
                  来源平台
                </label>
                <select
                  id="platform-binding-platform"
                  aria-label="来源平台"
                  disabled={!canConfigurePlatformBinding}
                  value={formData.platform_binding_platform}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      platform_binding_platform: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border-2 border-forest-200 bg-white px-4 py-2 text-sm text-forest-700 outline-none transition-all focus:border-primary disabled:cursor-not-allowed disabled:bg-forest-100"
                >
                  <option value="">不绑定具体平台任务</option>
                  <option value="ixl">IXL</option>
                  <option value="khan-academy">Khan Academy</option>
                </select>
              </div>

              <Input
                id="platform-binding-source-ref"
                label="平台任务 Source Ref"
                aria-label="平台任务 Source Ref"
                disabled={!canConfigurePlatformBinding}
                value={formData.platform_binding_source_ref}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    platform_binding_source_ref: e.target.value,
                  }))
                }
                placeholder="例如 lesson-123 / skill-a4"
              />
            </div>

            <p className="mt-3 text-xs text-forest-500">
              {canConfigurePlatformBinding
                ? "如果平台端有明确的任务编号或课程编号，建议在这里填入，能明显减少误匹配。"
                : "当前选择了多个孩子，已暂时禁用精确平台绑定，避免不同孩子共享同一个外部任务编号。"}
            </p>

            {canConfigurePlatformBinding ? (
              <div className="mt-3 rounded-xl border border-forest-100 bg-white px-3 py-3 text-sm text-forest-600">
                <p className="font-medium text-forest-700">孩子平台账号自动匹配</p>
                {matchedPlatformAccount ? (
                  <p className="mt-1">
                    已匹配 {matchedPlatformAccount.platform} 账号：
                    {matchedPlatformAccount.external_account_ref}
                  </p>
                ) : autoMatchedPlatform ? (
                  <p className="mt-1 text-amber-700">
                    当前作业类型已自动匹配到平台 {autoMatchedPlatform}，但这个孩子还没有绑定对应的平台账号。
                  </p>
                ) : (
                  <p className="mt-1">
                    当作业类型是 IXL 或 Khan Academy 时，这里会自动带出对应平台，作业级只需要再补精确的 task source ref。
                  </p>
                )}
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-forest-200 bg-forest-50/70 p-4">
            <div>
              <label className="block text-sm font-medium text-forest-700">
                作业提交群
              </label>
              <p className="mt-1 text-sm text-forest-500">
                这条作业是否自动发到微信群，以及发到哪个老师群，应该在创建或编辑作业时确定。留空时会继承孩子默认群。
              </p>
            </div>

            {canConfigurePlatformBinding ? (
              <>
                <label className="mt-4 flex items-center gap-3 text-sm text-forest-700">
                  <input
                    type="checkbox"
                    checked={formData.send_to_wechat}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        send_to_wechat: e.target.checked,
                        wechat_group_id: e.target.checked ? prev.wechat_group_id : "",
                      }))
                    }
                  />
                  提交完成后自动发到微信群
                </label>

                {formData.send_to_wechat ? (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="homework-wechat-group"
                        className="mb-1 block text-sm font-medium text-forest-700"
                      >
                        提交到哪个微信群
                      </label>
                      <select
                        id="homework-wechat-group"
                        aria-label="提交到哪个微信群"
                        value={formData.wechat_group_id}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            wechat_group_id: e.target.value,
                          }))
                        }
                        className="w-full rounded-xl border-2 border-forest-200 bg-white px-4 py-2 text-sm text-forest-700 outline-none transition-all focus:border-primary"
                      >
                        <option value="">继承孩子默认群</option>
                        {wechatGroups.map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.display_name || group.recipient_ref}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : null}

                {formData.send_to_wechat ? (
                  formData.wechat_group_id ? (
                    <p className="mt-4 text-sm text-forest-500">
                      当前这条作业会使用单独指定的提交群。
                    </p>
                  ) : (
                    <p className="mt-4 text-sm text-forest-500">
                      当前会继承孩子默认提交群
                      {selectedChildDefaultGroup
                        ? `：${selectedChildDefaultGroup.display_name || selectedChildDefaultGroup.recipient_ref}`
                        : "，但这个孩子暂时还没有设置默认群。"}
                    </p>
                  )
                ) : (
                  <p className="mt-4 text-sm text-forest-500">
                    当前这条作业不会自动发送到微信群。
                  </p>
                )}
              </>
            ) : (
              <p className="mt-4 text-sm text-forest-500">
                当前是多人批量创建。作业级提交群只在单个孩子的作业上配置，避免把同一目标误绑给多个孩子。
              </p>
            )}
          </div>

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
