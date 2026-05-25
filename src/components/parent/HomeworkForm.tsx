"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useTranslation } from "@/hooks/useTranslation";
import { HomeworkAssignmentPanel } from "@/components/parent/HomeworkAssignmentPanel";
import {
  buildAssignmentSummary,
  buildHomeworkDraftFromSource,
  buildHomeworkInsertRows,
  decodeDescriptionMeta,
  type HomeworkFormState,
} from "@/lib/homework-form";
import type { Database } from "@/lib/supabase/types";
import { DEFAULT_TYPE_GROUPS, DEFAULT_TYPES } from "@/lib/homework-types";

type Child = Database["public"]["Tables"]["children"]["Row"];
type PlatformAccount = Database["public"]["Tables"]["platform_accounts"]["Row"];
type MessageRoutingRule =
  Database["public"]["Tables"]["message_routing_rules"]["Row"];
type WeChatGroup = Database["public"]["Tables"]["wechat_groups"]["Row"];

type TypeGroup = {
  id: string;
  name: string;
  icon: string;
  sort_order: number;
};



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
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [children, setChildren] = useState<Child[]>([]);
  const [platformAccounts, setPlatformAccounts] = useState<PlatformAccount[]>([]);
  const [routingRules, setRoutingRules] = useState<MessageRoutingRule[]>([]);
  const [wechatGroups, setWechatGroups] = useState<WeChatGroup[]>([]);
  const [typeGroups, setTypeGroups] = useState<TypeGroup[]>([]);
  const [typeBindings, setTypeBindings] = useState<Record<string, { allowed_platforms: string[]; match_keywords: string[] }>>({});
  const [loading, setLoading] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [readingArticles, setReadingArticles] = useState<
    Array<{ id: string; title: string; grade_level: number; category: string }>
  >([]);
  const [hasLoadedCopySource, setHasLoadedCopySource] = useState(false);
  const [customSecondaryTypes, setCustomSecondaryTypes] = useState<
    Array<{ id: string; name: string; icon: string; default_points: number; group_id: string; is_custom: boolean }>
  >([]);
  const [apiTypes, setApiTypes] = useState<
    Array<{ id: string; name: string; icon: string; default_points: number; group_id: string; is_custom: boolean }>
  >([]);
  const [newCustomTypeName, setNewCustomTypeName] = useState("");
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
    type_group_id: homework?.type_group_id || "",
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


      try {
        const res = await fetch("/api/homework-types");
        if (res.ok) {
          const apiData = await res.json();
          if (apiData.groups) {
            setTypeGroups(apiData.groups);
          }
          if (apiData.types) {
            setApiTypes(apiData.types);
            const apiCustomTypes = apiData.types.filter((t: any) => t.is_custom);
            setCustomSecondaryTypes(apiCustomTypes);
            const apiMap: Record<string, { allowed_platforms: string[]; match_keywords: string[] }> = {};
            for (const t of apiData.types) {
              if (t.allowed_platforms || t.match_keywords) {
                apiMap[t.id] = {
                  allowed_platforms: t.allowed_platforms || [],
                  match_keywords: t.match_keywords || [],
                };
              }
            }
            setTypeBindings(apiMap);
          }
        } else {
          setTypeGroups(DEFAULT_TYPE_GROUPS);
        }
      } catch {
        setTypeGroups(DEFAULT_TYPE_GROUPS);
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

  const allTypes = apiTypes.length > 0 ? apiTypes : DEFAULT_TYPES.map((t) => ({ ...t, is_custom: false }));

  const effectiveTypeGroups = typeGroups.length > 0 ? typeGroups : DEFAULT_TYPE_GROUPS;

  const filteredTypes = formData.type_group_id
    ? (formData.type_group_id === "group_custom"
        ? customSecondaryTypes
        : allTypes.filter((t) => t.group_id === formData.type_group_id))
    : [];

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
    if (normalizedType === "raz-kids" || normalizedType === "raz kids" || normalizedType === "raz") {
      return "raz-kids";
    }
    if (normalizedType === "epic" || normalizedType === "epic reading") {
      return "epic";
    }
    return "";
  })();
  const currentTypeId = formData.type_id || (allTypes.find(t => t.name === formData.type_name)?.id ?? "");
  const currentBinding = typeBindings[currentTypeId];
  const relevantPlatforms = currentBinding?.allowed_platforms || [];

  const effectiveAutoMatchedPlatform =
    autoMatchedPlatform && relevantPlatforms.includes(autoMatchedPlatform)
      ? autoMatchedPlatform
      : "";
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
  const canBatchAssign = !isEditing && !prefilledChildId;

  const isReadingType =
    formData.type_name === "阅读" || formData.type_name === "英文阅读" ||
    (effectiveTypeGroups.find(g => g.id === formData.type_group_id)?.name === "英文" && formData.type_name === "阅读") ||
    (effectiveTypeGroups.find(g => g.id === formData.type_group_id)?.name === "中文" && formData.type_name === "阅读");

  useEffect(() => {
    if (!effectiveAutoMatchedPlatform || !canConfigurePlatformBinding) {
      return;
    }

    setFormData((prev) => {
      if (prev.platform_binding_platform === effectiveAutoMatchedPlatform) {
        return prev;
      }

      return {
        ...prev,
        platform_binding_platform: effectiveAutoMatchedPlatform,
      };
    });
  }, [effectiveAutoMatchedPlatform, canConfigurePlatformBinding]);

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

    setFormData((prev) => {
      const newBinding = typeBindings[type.id];
      const hasPlatforms = newBinding?.allowed_platforms?.length > 0;

      return {
        ...prev,
        type_id: type.id,
        type_name: type.name,
        type_icon: type.icon || "📝",
        point_value: type.default_points ?? 3,
        title: isAutoTitle ? type.name + "练习" : prev.title,
        type_group_id: type.group_id || prev.type_group_id,
        ...(!hasPlatforms ? { platform_binding_platform: "", platform_binding_source_ref: "" } : {}),
      };
    });
  };

  const handleGroupSelect = (groupId: string) => {
    const group = effectiveTypeGroups.find((g) => g.id === groupId);
    if (!group) return;
    setFormData((prev) => ({
      ...prev,
      type_group_id: groupId,
      type_name: "",
      type_icon: group.icon || "📝",
      platform_binding_platform: "",
      platform_binding_source_ref: "",
    }));
  };

  const handleAddCustomType = async () => {
    const name = newCustomTypeName.trim();
    if (!name) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data, error } = await supabase
      .from("custom_homework_types")
      .insert({ name, icon: "📝", default_points: 3, parent_id: session.user.id })
      .select("id")
      .maybeSingle();

    if (error || !data) {
      console.error("Failed to save custom type:", error);
      return;
    }

    const newCustomType = { id: data.id, name, icon: "📝", default_points: 3, group_id: "group_custom", is_custom: true };
    setCustomSecondaryTypes((prev) => [...prev, newCustomType]);
    setApiTypes((prev) => [...prev, newCustomType]);
    setNewCustomTypeName("");
    setFormData((prev) => ({
      ...prev,
      type_name: name,
      type_icon: "📝",
      point_value: 3,
      title: name + "练习",
    }));
  };

  const handleRemoveCustomType = (id: string) => {
    setCustomSecondaryTypes((prev) => prev.filter((t) => t.id !== id));
  };

  const handleClearGroup = () => {
    setFormData((prev) => ({
      ...prev,
      type_group_id: "",
      type_name: "",
      type_icon: "📝",
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
      toast("error", `保存作业失败: ${msg}`);
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
    <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl mx-auto">
      {/* Section 1: Basic Info (always expanded) */}
      <section className="rounded-radius-xl border border-ink-300 bg-white p-space-5 space-y-space-4">
        <h2 className="text-ui-lg font-ui-display font-semibold text-forest-700">{t('parent.homework.basicInfo')}</h2>

        <HomeworkAssignmentPanel
          children={children}
          selectedIds={formData.child_ids}
          canBatchAssign={canBatchAssign}
          createCountLabel={assignmentSummary.createCountLabel}
          independenceHint={assignmentSummary.independenceHint}
          onToggle={handleToggleChild}
        />

        {/* Primary category selector */}
        <div>
          <label className="block text-ui-sm font-medium text-forest-700 mb-space-1">
            {t('parent.homework.groupLabel')}
          </label>
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
            <button
              type="button"
              onClick={handleClearGroup}
              className={`rounded-radius-xl border-2 px-2 py-2 text-center text-ui-sm transition-all ${
                !formData.type_group_id
                  ? "border-forest-500 bg-forest-500/10 text-forest-600 font-medium"
                  : "border-ink-300 text-ink-600 hover:border-ink-300"
              }`}
            >
              <div className="text-ui-lg">📝</div>
              <div className="text-ui-xs mt-0.5">{t('parent.homework.allGroups')}</div>
            </button>
            {effectiveTypeGroups.map((group) => {
              const isSelected = formData.type_group_id === group.id;
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => handleGroupSelect(group.id)}
                  className={`rounded-radius-xl border-2 px-2 py-2 text-center text-ui-sm transition-all ${
                    isSelected
                      ? "border-forest-500 bg-forest-500/10 text-forest-600 font-medium"
                      : "border-ink-300 text-ink-600 hover:border-ink-300"
                  }`}
                >
                  <div className="text-ui-lg">{group.icon}</div>
                  <div className="text-ui-xs mt-0.5">{group.name}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Secondary type selector */}
        <div>
          <label className="block text-ui-sm font-medium text-forest-700 mb-space-1">
            {t('parent.homework.typeLabel')}
          </label>
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
            <button
              type="button"
              onClick={handleClearType}
              className={`rounded-radius-xl border-2 px-2 py-2 text-center text-ui-sm transition-all ${
                !formData.type_name
                  ? "border-forest-500 bg-forest-500/10 text-forest-600 font-medium"
                  : "border-ink-300 text-ink-600 hover:border-ink-300"
              }`}
            >
              <div className="text-ui-lg">📝</div>
              <div className="text-ui-xs mt-0.5">{t('parent.homework.custom')}</div>
            </button>
            {filteredTypes.map((type) => {
              const isSelected = formData.type_name === type.name;
              return (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => handleTypeSelect(type)}
                  className={`rounded-radius-xl border-2 px-2 py-2 text-center text-ui-sm transition-all ${
                    isSelected
                      ? "border-forest-500 bg-forest-500/10 text-forest-600 font-medium"
                      : "border-ink-300 text-ink-600 hover:border-ink-300"
                  }`}
                >
                  <div className="text-ui-lg">{type.icon}</div>
                  <div className="text-ui-xs mt-0.5">{type.name}</div>
                </button>
              );
            })}
          </div>

          {/* Custom secondary type input — only when 自定义 primary group is selected */}
          {formData.type_group_id === "group_custom" && (
            <div className="mt-3 flex gap-2">
              <input
                value={newCustomTypeName}
                onChange={(e) => setNewCustomTypeName(e.target.value)}
                placeholder="输入自定义类型名称，如：编程、游泳"
                className="w-full rounded-radius-xl border-2 border-ink-300 px-space-4 py-space-2 focus:border-forest-500 focus:outline-none"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddCustomType(); } }}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleAddCustomType}
                disabled={!newCustomTypeName.trim()}
              >
                添加
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* Section 2: Homework Title (always visible) */}
      <section className="rounded-radius-xl border border-ink-300 bg-white p-space-5 space-y-space-4">
        <h2 className="text-ui-lg font-ui-display font-semibold text-forest-700">{t('parent.homework.homeworkTitle')}</h2>

        <Input
          label={t('parent.homework.titleLabel')}
          aria-label={t('parent.homework.homeworkTitle')}
          value={formData.title}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, title: e.target.value }))
          }
          placeholder={
            formData.type_name ? `${formData.type_name}练习` : t('parent.homework.titlePlaceholder')
          }
          required
        />

        <div>
          <label className="mb-space-1 block text-ui-sm font-medium text-forest-700">
            {t('parent.homework.description')}
          </label>
          <textarea
            aria-label={t('parent.homework.description')}
            value={formData.description}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, description: e.target.value }))
            }
            placeholder={t('parent.homework.descriptionPlaceholder')}
            className="w-full rounded-radius-xl border-2 border-ink-300 px-space-4 py-space-2 focus:border-forest-500 focus:outline-none"
            rows={3}
          />
        </div>
      </section>

      {/* Section 3: Rules (always expanded) */}
      <section className="rounded-radius-xl border border-ink-300 bg-white p-space-5 space-y-space-4">
        <h2 className="text-ui-lg font-ui-display font-semibold text-forest-700">{t('parent.homework.rules')}</h2>

        <div>
          <label className="mb-space-2 block text-ui-sm font-medium text-forest-700">
            {t('parent.homework.repeatRule')}
          </label>
          <div className="flex gap-2 flex-wrap">
            {(["daily", "weekly", "interval", "once"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() =>
                  setFormData((prev) => ({ ...prev, repeat_type: type }))
                }
                className={`px-space-4 py-space-2 rounded-radius-xl border-2 transition-all ${
                  formData.repeat_type === type
                    ? "border-forest-500 bg-forest-500/10"
                    : "border-ink-300"
                }`}
              >
                {{
                  daily: t('parent.homework.daily'),
                  weekly: t('parent.homework.weekly'),
                  interval: t('parent.homework.interval'),
                  once: t('parent.homework.once'),
                }[type]}
              </button>
            ))}
          </div>
        </div>

        {formData.repeat_type === "weekly" && (
          <div>
            <label className="mb-space-2 block text-ui-sm font-medium text-forest-700">
              {t('parent.homework.selectDays')}
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
                      ? "border-forest-500 bg-forest-500 text-white"
                      : "border-ink-300"
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
            label={t('parent.homework.intervalDays')}
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
            label={formData.repeat_type === "once" ? t('parent.homework.homeworkDate') : t('parent.homework.startDate')}
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
          label={t('parent.homework.cutoffTimeLabel')}
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
            label={t('parent.homework.pointReward')}
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
            label={t('parent.homework.pointDeduction')}
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
      <section className="rounded-radius-xl border border-ink-300 bg-white p-space-5 space-y-space-4">
        <h2 className="text-ui-lg font-ui-display font-semibold text-forest-700">{t('parent.homework.proofRequired')}</h2>

        {/* Photo toggle */}
        <div className="flex items-center justify-between py-2">
          <div>
            <span className="text-ui-sm font-medium text-forest-700">
              {t('parent.homework.needPhoto')}
            </span>
            <p className="text-ui-xs text-ink-500 mt-0.5">
              {t('parent.homework.photoHint')}
            </p>
          </div>
          <button
            type="button"
            aria-label={t('parent.homework.needPhoto')}
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
        <div className="flex items-center justify-between py-2 border-t border-ink-300">
          <div>
            <span className="text-ui-sm font-medium text-forest-700">
              {t('parent.homework.enableRecording')}
            </span>
            <p className="text-ui-xs text-ink-500 mt-0.5">
              {t('parent.homework.recordingHint')}
            </p>
          </div>
          <button
            type="button"
            aria-label={t('parent.homework.enableRecording')}
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
          <div className="border-t border-ink-300 pt-space-4 space-y-space-3">
            {canConfigurePlatformBinding ? (
              <>
                <label className="flex items-center gap-3 text-ui-sm text-forest-700">
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
                  {t('parent.homework.autoSendWechat')}
                </label>

                {formData.send_to_wechat && (
                  <div>
                    <label
                      htmlFor="homework-wechat-group"
                      className="mb-1 block text-sm font-medium text-forest-700"
                    >
                      {t('parent.homework.selectWechatGroup')}
                    </label>
                    <select
                      id="homework-wechat-group"
                      aria-label={t('parent.homework.selectWechatGroup')}
                      value={formData.wechat_group_id}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          wechat_group_id: e.target.value,
                        }))
                      }
                      className="w-full rounded-xl border-2 border-ink-300 bg-white px-4 py-2 text-sm text-forest-700 outline-none transition-all focus:border-forest-500"
                    >
                      <option value="">{t('parent.homework.inheritDefault')}</option>
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
              <p className="text-ui-sm text-ink-500">
                {t('parent.homework.batchCreateWarning')}
              </p>
            )}
          </div>
        )}
      </section>

      {/* Section 5: Advanced Settings (collapsible, collapsed by default) */}
      <section className="rounded-3xl border border-ink-300 bg-white/90 p-5">
        <button
          type="button"
          onClick={() => setShowAdvancedSettings((prev) => !prev)}
          className="flex w-full items-center justify-between text-left"
        >
          <h2 className="text-ui-lg font-ui-display font-semibold text-forest-700">{t('parent.homework.advancedSettings')}</h2>
          <span className="text-ink-500 text-ui-sm transition-transform">
            {showAdvancedSettings ? t('parent.homework.collapse') : t('parent.homework.expand')}
          </span>
        </button>

        {showAdvancedSettings && (
          <div className="mt-space-4 space-y-space-4 border-t border-ink-300 pt-space-4">
            {/* Reading article binding — only for 阅读 or 英文阅读 */}
            {isReadingType && (
              <div className="rounded-radius-2xl border border-ink-300 bg-ink-50 p-space-4">
                <label className="block text-ui-sm font-medium text-forest-700 mb-space-2">
                  {t('parent.homework.bindReadingArticle')}
                </label>
                <p className="text-ui-sm text-ink-500 mb-space-3">
                  {t('parent.homework.bindReadingHint')}
                </p>
                <select
                  value={formData.reading_article_id}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      reading_article_id: e.target.value,
                    }))
                  }
                  className="w-full rounded-radius-xl border-2 border-ink-300 bg-white px-space-4 py-space-3 text-ui-sm"
                >
                  <option value="">{t('parent.homework.freeChoice')}</option>
                  {readingArticles.map((a) => (
                    <option key={a.id} value={a.id}>
                      [{a.category}] {a.title} (G{a.grade_level})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Platform binding */}
            <div className="rounded-radius-2xl border border-ink-300 bg-ink-50 p-space-4">
              <div>
                <label className="block text-sm font-medium text-forest-700">
                  {t('parent.homework.platformBinding')}
                </label>
                <p className="mt-space-1 text-ui-sm text-ink-500">
                  {t('parent.homework.platformBindingHint')}
                </p>
              </div>

              {relevantPlatforms.length === 0 && formData.type_group_id !== "group_chinese" ? (
                <p className="mt-space-4 text-ui-sm text-ink-500">
                  此作业类型暂不支持平台绑定。
                </p>
              ) : formData.type_group_id === "group_chinese" ? (
                <div className="mt-space-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="platform-binding-platform"
                      className="mb-1 block text-sm font-medium text-forest-700"
                    >
                      {t('parent.homework.sourcePlatform')}
                    </label>
                    <select
                      id="platform-binding-platform"
                      aria-label={t('parent.homework.sourcePlatform')}
                      disabled
                      value=""
                      className="w-full rounded-radius-xl border-2 border-ink-300 bg-white px-space-4 py-space-2 text-ui-sm text-forest-700 outline-none transition-all focus:border-forest-500 disabled:cursor-not-allowed disabled:bg-ink-100"
                    >
                      <option value="">{t('parent.homework.noBinding')}</option>
                    </select>
                  </div>
                  <Input
                    id="platform-binding-source-ref"
                    label={t('parent.homework.sourceRef')}
                    aria-label={t('parent.homework.sourceRef')}
                    disabled
                    value=""
                    placeholder={t('parent.homework.sourceRefPlaceholder')}
                  />
                </div>
              ) : (
                <div className="mt-space-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="platform-binding-platform"
                      className="mb-1 block text-sm font-medium text-forest-700"
                    >
                      {t('parent.homework.sourcePlatform')}
                    </label>
                    <select
                      id="platform-binding-platform"
                      aria-label={t('parent.homework.sourcePlatform')}
                      disabled={!canConfigurePlatformBinding}
                      value={formData.platform_binding_platform}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          platform_binding_platform: e.target.value,
                        }))
                      }
                      className="w-full rounded-radius-xl border-2 border-ink-300 bg-white px-space-4 py-space-2 text-ui-sm text-forest-700 outline-none transition-all focus:border-forest-500 disabled:cursor-not-allowed disabled:bg-ink-100"
                    >
                      <option value="">{t('parent.homework.noBinding')}</option>
                      {relevantPlatforms.map((p) => {
                        const labels: Record<string, string> = {
                          ixl: "IXL",
                          "khan-academy": "Khan Academy",
                          "raz-kids": "Raz-Kids",
                          epic: "EPIC",
                        };
                        return <option key={p} value={p}>{labels[p] || p}</option>;
                      })}
                    </select>
                  </div>
                  <Input
                    id="platform-binding-source-ref"
                    label={t('parent.homework.sourceRef')}
                    aria-label={t('parent.homework.sourceRef')}
                    disabled={!canConfigurePlatformBinding}
                    value={formData.platform_binding_source_ref}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        platform_binding_source_ref: e.target.value,
                      }))
                    }
                    placeholder={t('parent.homework.sourceRefPlaceholder')}
                  />
                </div>
              )}

              {formData.type_group_id === "group_chinese" && (
                <p className="mt-space-3 text-ui-xs text-ink-500">
                  平台绑定功能预留中，中文内容暂不支持自动拉取。
                </p>
              )}

              {canConfigurePlatformBinding && relevantPlatforms.length > 0 && formData.type_group_id !== "group_chinese" && (
                <div className="mt-3 rounded-radius-xl border border-ink-300 bg-white px-space-3 py-space-3 text-ui-sm text-ink-600">
                  <p className="font-medium text-forest-700">
                    {t('parent.homework.autoMatchTitle')}
                  </p>
                  {matchedPlatformAccount ? (
                    <p className="mt-space-1">
                      已匹配 {matchedPlatformAccount.platform} 账号：
                      {matchedPlatformAccount.external_account_ref}
                    </p>
                  ) : effectiveAutoMatchedPlatform ? (
                    <p className="mt-1 text-amber-700">
                      当前作业类型已自动匹配到平台 {effectiveAutoMatchedPlatform}
                      ，但这个孩子还没有绑定对应的平台账号。
                    </p>
                  ) : (
                    <p className="mt-space-1">
                      当作业类型是 IXL 或 Khan Academy
                      时，这里会自动带出对应平台，作业级只需要再补精确的 task source ref。
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Estimated minutes */}
            <Input
              label={t('parent.homework.estimatedMinutesLabel')}
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
          {t('common.cancel')}
        </Button>
        <Button
          type="submit"
          className="flex-1"
          disabled={
            loading || formData.child_ids.length === 0 || !formData.title
          }
        >
          {loading ? t('parent.homework.saving') : homework ? t('parent.homework.updateHomeworkBtn') : t('parent.homework.createHomeworkBtn')}
        </Button>
      </div>
    </form>
  );
}
