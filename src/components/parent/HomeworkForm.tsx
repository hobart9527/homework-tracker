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
  decodeDescriptionMeta,
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
  { id: "english_reading", name: "英文阅读", icon: "📚", default_points: 5 },
  { id: "math", name: "数学", icon: "📐", default_points: 4 },
  { id: "english", name: "英语", icon: "🔤", default_points: 4 },
  { id: "science", name: "科学", icon: "🔬", default_points: 3 },
  { id: "coding", name: "编程", icon: "💻", default_points: 4 },
  { id: "calligraphy", name: "书法", icon: "✍️", default_points: 3 },
  { id: "drawing", name: "画画", icon: "🎨", default_points: 3 },
  { id: "dance", name: "舞蹈", icon: "💃", default_points: 3 },
  { id: "swimming", name: "游泳", icon: "🏊", default_points: 3 },
  { id: "running", name: "跑步", icon: "🏃", default_points: 2 },
  { id: "skipping", name: "跳绳", icon: "🪢", default_points: 2 },
  { id: "poetry", name: "古诗背诵", icon: "📜", default_points: 4 },
  { id: "mental_math", name: "口算", icon: "🧮", default_points: 3 },
  { id: "writing", name: "写字", icon: "✏️", default_points: 3 },
  { id: "listening", name: "听力", icon: "🎧", default_points: 3 },
  { id: "speaking", name: "口语", icon: "🗣️", default_points: 4 },
];

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
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [readingArticles, setReadingArticles] = useState<
    Array<{ id: string; title: string; grade_level: number; category: string }>
  >([]);
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

  const editingDescriptionMeta = homework?.description
    ? decodeDescriptionMeta(homework.description)
    : { description: "", meta: {} };

  const [formData, setFormData] = useState<HomeworkFormState>({
    child_ids: homework?.child_id ? [homework.child_id] : [],
    type_id: homework?.type_id || "",
    type_name: homework?.type_name || "",
    type_icon: homework?.type_icon || "📝",
    title: homework?.title || "",
    description: editingDescriptionMeta.description || homework?.description || "",
    repeat_type: (homework?.repeat_type || "daily") as
      | "daily"
      | "weekly"
      | "interval"
      | "once",
    repeat_days: homework?.repeat_days || [],
    repeat_interval: homework?.repeat_interval || 1,
    repeat_start_date: homework?.repeat_start_date || "",
    point_value: homework?.point_value || 3,
    point_deduction: homework?.point_deduction ?? 3,
    estimated_minutes: homework?.estimated_minutes ?? null,
    daily_cutoff_time: homework?.daily_cutoff_time || "23:30",
    required_checkpoint_type: (homework?.required_checkpoint_type || "") as
      | ""
      | "photo"
      | "audio",
    platform_binding_platform: homework?.platform_binding_platform || "",
    platform_binding_source_ref: homework?.platform_binding_source_ref || "",
    send_to_wechat: homework?.send_to_wechat || false,
    wechat_group_id: homework?.wechat_group_id || "",
    enable_recording: (editingDescriptionMeta.meta.enable_recording as boolean) || false,
    reading_article_id: (editingDescriptionMeta.meta.reading_article_id as string) || "",
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
        ] = await Promise.all([
          supabase
            .from("platform_accounts")
            .select("*")
            .in("child_id", childIds),
          supabase
            .from("message_routing_rules")
            .select("*")
            .in("child_id", childIds)
            .order("created_at", { ascending: false }),
          supabase
            .from("wechat_groups")
            .select("*")
            .eq("parent_id", session.user.id),
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

      if (!homework && !copyFromHomeworkId && childrenData?.length && !prefilledChildId) {
        setFormData((prev) => ({ ...prev, child_ids: [childrenData[0].id] }));
      }
    };

    fetchData();
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

  const isReadingType =
    formData.type_name === "阅读" || formData.type_name === "英文阅读";

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

  useEffect(() => {
    if (!isReadingType) return;
    fetch("/api/reading/articles")
      .then((r) => r.json())
      .then((d) => setReadingArticles(d.articles || []))
      .catch(() => {});
  }, [formData.type_name, isReadingType]);

  const handleTypeSelect = (type: (typeof allTypes)[0]) => {
    const prevDefaultTitle = formData.type_name
      ? (() => {
          const found = DEFAULT_TYPES.find((t) => t.name === formData.type_name);
          if (found) return found.name + "练习";
        })()
      : null;
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

      // Create reading assignment for reading/homework types
      if (isReadingType && formData.reading_article_id && savedHomeworkId) {
        for (const childId of formData.child_ids) {
          try {
            await fetch("/api/reading/assignments", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                childId,
                articleId: formData.reading_article_id,
              }),
            });
          } catch {}
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

      return {
        ...prev,
        child_ids,
      };
    });
  };

  const handleClearType = () => {
    setFormData((prev) => ({
      ...prev,
      type_id: "",
      type_name: "",
      type_icon: "📝",
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl mx-auto">
      {/* Compact Rule Preview Card (sticky summary) */}
      <div className="sticky top-0 z-10">
        <HomeworkRulePreview preview={preview} />
      </div>

      {/* Section 1: 基本信息 (always expanded) */}
      <section className="rounded-3xl border border-forest-200 bg-white/90 p-5 space-y-4">
        <h2 className="text-lg font-semibold text-forest-700">基本信息</h2>

        <HomeworkAssignmentPanel
          children={children}
          selectedIds={formData.child_ids}
          canBatchAssign={canBatchAssign}
          createCountLabel={assignmentSummary.createCountLabel}
          independenceHint={assignmentSummary.independenceHint}
          onToggle={handleToggleChild}
        />

        {/* Type chip grid selector */}
        <div>
          <label className="block text-sm font-medium text-forest-700 mb-1">
            作业类型
          </label>
          <p className="text-sm text-forest-500 mb-3">
            选择一个类型自动带入标题建议、图标和默认积分。
          </p>
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
            <button
              type="button"
              onClick={handleClearType}
              className={`rounded-xl border-2 px-2 py-2 text-center text-sm transition-all ${
                !formData.type_name
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "border-forest-200 text-forest-600 hover:border-forest-300"
              }`}
            >
              <div className="text-lg">📝</div>
              <div className="text-xs mt-0.5">自定义</div>
            </button>
            {allTypes.map((type) => {
              const isSelected = formData.type_name === type.name;
              return (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => handleTypeSelect(type)}
                  className={`rounded-xl border-2 px-2 py-2 text-center text-sm transition-all ${
                    isSelected
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-forest-200 text-forest-600 hover:border-forest-300"
                  }`}
                >
                  <div className="text-lg">{type.icon}</div>
                  <div className="text-xs mt-0.5">{type.name}</div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Section 2: 作业标题 (always visible) */}
      <section className="rounded-3xl border border-forest-200 bg-white/90 p-5 space-y-4">
        <h2 className="text-lg font-semibold text-forest-700">作业标题</h2>

        <Input
          label="标题"
          aria-label="作业标题"
          value={formData.title}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, title: e.target.value }))
          }
          placeholder={
            formData.type_name ? `${formData.type_name}练习` : "如：Khan Math Unit 3"
          }
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
      </section>

      {/* Section 3: 作业规则 (always expanded) */}
      <section className="rounded-3xl border border-forest-200 bg-white/90 p-5 space-y-4">
        <h2 className="text-lg font-semibold text-forest-700">作业规则</h2>

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
      </section>

      {/* Section 4: 证明要求 (always expanded, simplified) */}
      <section className="rounded-3xl border border-forest-200 bg-white/90 p-5 space-y-4">
        <h2 className="text-lg font-semibold text-forest-700">证明要求</h2>

        {/* Photo toggle */}
        <div className="flex items-center justify-between py-2">
          <div>
            <span className="text-sm font-medium text-forest-700">
              需要拍照证明
            </span>
            <p className="text-xs text-forest-500 mt-0.5">
              开启后孩子完成时需要提交照片
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setFormData((prev) => {
                const newVal =
                  prev.required_checkpoint_type === "photo" ? "" : "photo";
                return {
                  ...prev,
                  required_checkpoint_type: newVal as "" | "photo",
                };
              });
            }}
            className={`relative w-12 h-7 rounded-full transition-colors ${
              formData.required_checkpoint_type === "photo"
                ? "bg-forest-500"
                : "bg-ink-300"
            }`}
          >
            <div
              className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${
                formData.required_checkpoint_type === "photo"
                  ? "left-6"
                  : "left-1"
              }`}
            />
          </button>
        </div>

        {/* Recording toggle */}
        <div className="flex items-center justify-between py-2 border-t border-forest-100">
          <div>
            <span className="text-sm font-medium text-forest-700">
              开启录音打卡
            </span>
            <p className="text-xs text-forest-500 mt-0.5">
              开启后孩子完成作业时需要录音打卡
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setFormData((prev) => ({
                ...prev,
                enable_recording: !prev.enable_recording,
                send_to_wechat: !prev.enable_recording
                  ? prev.send_to_wechat
                  : false,
              }));
            }}
            className={`relative w-12 h-7 rounded-full transition-colors ${
              formData.enable_recording ? "bg-forest-500" : "bg-ink-300"
            }`}
          >
            <div
              className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${
                formData.enable_recording ? "left-6" : "left-1"
              }`}
            />
          </button>
        </div>

        {/* WeChat push — inline, only when recording is ON */}
        {formData.enable_recording && (
          <div className="border-t border-forest-100 pt-4 space-y-3">
            {canConfigurePlatformBinding ? (
              <>
                <label className="flex items-center gap-3 text-sm text-forest-700">
                  <input
                    type="checkbox"
                    checked={formData.send_to_wechat}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        send_to_wechat: e.target.checked,
                        wechat_group_id: e.target.checked
                          ? prev.wechat_group_id
                          : "",
                      }))
                    }
                  />
                  提交完成后自动发到微信群
                </label>

                {formData.send_to_wechat && (
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
                          {group.display_name
                            ? `"${group.display_name}"`
                            : `群聊 ${group.recipient_ref.slice(0, 12)}...`}
                        </option>
                      ))}
                    </select>

                    {formData.send_to_wechat && (
                      <p className="mt-3 text-sm text-forest-500">
                        {formData.wechat_group_id ? (
                          "当前这条作业会使用单独指定的提交群，覆盖孩子默认设置。"
                        ) : (
                          <>
                            {selectedChildDefaultGroup ? (
                              <>
                                当前会继承 {selectedChild?.name} 的默认提交群
                                {selectedChildDefaultGroup.display_name
                                  ? `"${selectedChildDefaultGroup.display_name}"`
                                  : `群聊 ${selectedChildDefaultGroup.recipient_ref.slice(0, 12)}...`}
                                。可在孩子集成页修改默认群。
                              </>
                            ) : (
                              <>
                                当前会继承 {selectedChild?.name}
                                的默认提交群，但这个孩子暂时还没有设置默认群。可在孩子集成页修改默认群。
                              </>
                            )}
                          </>
                        )}
                      </p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-forest-500">
                当前是多人批量创建。作业级提交群只在单个孩子的作业上配置，避免把同一目标误绑给多个孩子。
              </p>
            )}
          </div>
        )}
      </section>

      {/* Section 5: 高级设置 (collapsible, collapsed by default) */}
      <section className="rounded-3xl border border-forest-200 bg-white/90 p-5">
        <button
          type="button"
          onClick={() => setShowAdvancedSettings((prev) => !prev)}
          className="flex w-full items-center justify-between text-left"
        >
          <h2 className="text-lg font-semibold text-forest-700">高级设置</h2>
          <span className="text-forest-500 text-sm transition-transform">
            {showAdvancedSettings ? "收起 ▲" : "展开 ▼"}
          </span>
        </button>

        {showAdvancedSettings && (
          <div className="mt-4 space-y-4 border-t border-forest-100 pt-4">
            {/* Reading article binding — only for 阅读 or 英文阅读 */}
            {isReadingType && (
              <div className="rounded-2xl border border-forest-200 bg-forest-50/70 p-4">
                <label className="block text-sm font-medium text-forest-700 mb-2">
                  绑定阅读文章（可选）
                </label>
                <p className="text-sm text-forest-500 mb-3">
                  留空则孩子可以从阅读库中自由选择
                </p>
                <select
                  value={formData.reading_article_id}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      reading_article_id: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border-2 border-forest-200 bg-white px-4 py-3 text-sm"
                >
                  <option value="">不绑定，自由选择</option>
                  {readingArticles.map((a) => (
                    <option key={a.id} value={a.id}>
                      [{a.category}] {a.title} (G{a.grade_level})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Platform binding */}
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

              {canConfigurePlatformBinding && (
                <div className="mt-3 rounded-xl border border-forest-100 bg-white px-3 py-3 text-sm text-forest-600">
                  <p className="font-medium text-forest-700">
                    孩子平台账号自动匹配
                  </p>
                  {matchedPlatformAccount ? (
                    <p className="mt-1">
                      已匹配 {matchedPlatformAccount.platform} 账号：
                      {matchedPlatformAccount.external_account_ref}
                    </p>
                  ) : autoMatchedPlatform ? (
                    <p className="mt-1 text-amber-700">
                      当前作业类型已自动匹配到平台 {autoMatchedPlatform}
                      ，但这个孩子还没有绑定对应的平台账号。
                    </p>
                  ) : (
                    <p className="mt-1">
                      当作业类型是 IXL 或 Khan Academy
                      时，这里会自动带出对应平台，作业级只需要再补精确的 task source ref。
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Estimated minutes */}
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
          </div>
        )}
      </section>

      {/* Submit buttons */}
      <div className="flex gap-3">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          取消
        </Button>
        <Button
          type="submit"
          className="flex-1"
          disabled={
            loading || formData.child_ids.length === 0 || !formData.title
          }
        >
          {loading ? "保存中..." : homework ? "更新作业" : "创建作业"}
        </Button>
      </div>
    </form>
  );
}
