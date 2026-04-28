"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SettingsShell } from "@/components/parent/SettingsShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { Database } from "@/lib/supabase/types";

type Child = Database["public"]["Tables"]["children"]["Row"];
type Homework = Database["public"]["Tables"]["homeworks"]["Row"];
type PlatformAccount = Database["public"]["Tables"]["platform_accounts"]["Row"];
type MessageRoutingRule =
  Database["public"]["Tables"]["message_routing_rules"]["Row"];
type WeChatGroup = Database["public"]["Tables"]["wechat_groups"]["Row"];
type SupportedPlatform = "ixl" | "khan-academy" | "raz-kids" | "epic";

const AUTO_LOGIN_PLATFORMS = new Set<SupportedPlatform>([
  "ixl",
  "khan-academy",
]);

function getPlatformDisplayName(platform: string) {
  if (platform === "ixl") return "IXL";
  if (platform === "khan-academy") return "Khan Academy";
  if (platform === "raz-kids") return "Raz-Kids";
  if (platform === "epic") return "Epic";
  return platform;
}

function getManualSessionLoginUrl(platform: string) {
  if (platform === "ixl") return "https://www.ixl.com/signin";
  if (platform === "khan-academy") return "https://www.khanacademy.org/login";
  if (platform === "epic") return "https://www.getepic.com/sign-in/parent";
  return "https://www.raz-kids.com/";
}

export default function SettingsIntegrationsPage() {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();
  const router = useRouter();
  const selectedChildIdFromQuery = searchParams.get("childId");
  const [loading, setLoading] = useState(true);
  const [parentId, setParentId] = useState<string | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [homeworks, setHomeworks] = useState<Homework[]>([]);
  const [platformAccounts, setPlatformAccounts] = useState<PlatformAccount[]>([]);
  const [routingRules, setRoutingRules] = useState<MessageRoutingRule[]>([]);
  const [wechatGroups, setWechatGroups] = useState<WeChatGroup[]>([]);
  const [bindingForm, setBindingForm] = useState({
    childId: "",
    platform: "ixl" as SupportedPlatform,
    username: "",
    authMode: "auto_login" as "auto_login" | "manual_session",
    loginUsername: "",
    loginPassword: "",
    managedSessionPayloadText: "",
    managedSessionCapturedAt: "",
  });
  const [bindingError, setBindingError] = useState<string | null>(null);
  const [bindingLoading, setBindingLoading] = useState(false);
  const [manualSessionGuide, setManualSessionGuide] = useState<{
    platform: string;
    url: string;
    message: string;
  } | null>(null);
  const [takeoverAccountId, setTakeoverAccountId] = useState<string | null>(null);
  const [takeoverMethod, setTakeoverMethod] = useState<"script" | "manual">("script");
  const [takeoverPayload, setTakeoverPayload] = useState<string>("");
  const [takeoverLoading, setTakeoverLoading] = useState(false);
  const [copiedCommand, setCopiedCommand] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [editCredentialId, setEditCredentialId] = useState<string | null>(null);
  const [editCredentialUsername, setEditCredentialUsername] = useState("");
  const [editCredentialPassword, setEditCredentialPassword] = useState("");
  const [editCredentialLoading, setEditCredentialLoading] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedChildId, setSelectedChildId] = useState<string>("");

  const [childGroupSelections, setChildGroupSelections] = useState<
    Record<string, string>
  >({});
  const [savingChildGroupId, setSavingChildGroupId] = useState<string | null>(null);
  const [showGroupAddForm, setShowGroupAddForm] = useState(false);
  const [groupAddForm, setGroupAddForm] = useState({ recipientRef: "", displayName: "" });
  const [groupAddLoading, setGroupAddLoading] = useState(false);
  const [groupAddError, setGroupAddError] = useState<string | null>(null);
  const [groupEditingId, setGroupEditingId] = useState<string | null>(null);
  const [groupEditName, setGroupEditName] = useState("");
  const [groupEditLoading, setGroupEditLoading] = useState(false);

  const refreshData = async (nextParentId: string) => {
    const { data: childrenData } = await supabase
      .from("children")
      .select("*")
      .eq("parent_id", nextParentId);

    const childRows = (childrenData ?? []) as Child[];
    setChildren(childRows);

    if (!childRows.length) {
      setHomeworks([]);
      setPlatformAccounts([]);
      setRoutingRules([]);
      setWechatGroups([]);
      setChildGroupSelections({});
      return;
    }

    const childIds = childRows.map((child) => child.id);

    const [
      { data: homeworksData },
      { data: accountsData },
      { data: rulesData },
      { data: groupsData },
    ] =
      await Promise.all([
        supabase.from("homeworks").select("*").in("child_id", childIds),
        supabase.from("platform_accounts").select("*").in("child_id", childIds),
        supabase
          .from("message_routing_rules")
          .select("*")
          .in("child_id", childIds)
          .order("created_at", { ascending: false }),
        supabase.from("wechat_groups").select("*").eq("parent_id", nextParentId),
      ]);

    setHomeworks((homeworksData ?? []) as Homework[]);
    setPlatformAccounts((accountsData ?? []) as PlatformAccount[]);
    setWechatGroups((groupsData ?? []) as WeChatGroup[]);
    setRoutingRules(
      ((rulesData ?? []) as MessageRoutingRule[]).filter(
        (rule) => rule.channel === "wechat_group"
      )
    );
    setChildGroupSelections(
      Object.fromEntries(
        childRows.map((child) => [child.id, child.default_wechat_group_id || ""])
      )
    );
  };

  useEffect(() => {
    const fetchData = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setLoading(false);
        return;
      }

      setParentId(session.user.id);
      await refreshData(session.user.id);
      setLoading(false);
    };

    fetchData();
  }, [supabase]);

  useEffect(() => {
    if (!children.length) return;

    const validFromQuery =
      selectedChildIdFromQuery &&
      children.some((c) => c.id === selectedChildIdFromQuery)
        ? selectedChildIdFromQuery
        : null;

    const nextId = validFromQuery || children[0].id;

    setSelectedChildId((prev) => {
      if (prev && children.some((c) => c.id === prev)) return prev;
      return nextId;
    });
  }, [children, selectedChildIdFromQuery]);

  useEffect(() => {
    if (selectedChildId) {
      setBindingForm((prev) => ({ ...prev, childId: selectedChildId }));
    }
  }, [selectedChildId]);

  const homeworkTitleById = Object.fromEntries(
    homeworks.map((homework) => [homework.id, homework.title])
  );
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-2xl">加载中...</div>
      </div>
    );
  }

  const handleBindingSubmit = async () => {
    setBindingError(null);
    setManualSessionGuide(null);

    if (!bindingForm.childId || !bindingForm.username.trim()) {
      setBindingError("请选择孩子并填写账号标识。");
      return;
    }

    if (bindingForm.authMode === "auto_login" && !bindingForm.loginPassword) {
      setBindingError("自动登录模式需要填写登录密码。");
      return;
    }

    let managedSessionPayload: Record<string, unknown> | null = null;

    if (bindingForm.authMode === "manual_session" && bindingForm.managedSessionPayloadText.trim()) {
      try {
        managedSessionPayload = JSON.parse(
          bindingForm.managedSessionPayloadText
        ) as Record<string, unknown>;
      } catch {
        setBindingError("Managed Session JSON 格式不正确。");
        return;
      }
    }

    setBindingLoading(true);

    try {
      const response = await fetch("/api/platform-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          childId: bindingForm.childId,
          platform: bindingForm.platform,
          username: bindingForm.username.trim(),
          authMode: bindingForm.authMode,
          loginUsername: bindingForm.loginUsername.trim() || bindingForm.username.trim(),
          loginPassword: bindingForm.loginPassword,
          managedSessionPayload,
          managedSessionCapturedAt:
            bindingForm.managedSessionCapturedAt || null,
        }),
      });

      const body = await response.json();

      if (!response.ok) {
        let errorMsg = body.error || "绑定学习平台账号失败，请稍后重试。";
        if (body.reason === "captcha_required") {
          errorMsg += " 该平台当前需要验证码，请切换到手动 Session 模式。";
        } else if (body.reason === "two_factor_required") {
          errorMsg += " 该平台开启了双重验证，请使用手动 Session 模式。";
        } else if (body.hint) {
          errorMsg += ` ${body.hint}`;
        }

        if (
          body.reason === "captcha_required" ||
          body.reason === "two_factor_required" ||
          body.reason === "unsupported"
        ) {
          setBindingForm((prev) => ({
            ...prev,
            authMode: "manual_session",
            managedSessionPayloadText:
              prev.managedSessionPayloadText ||
              (body.manualSessionTemplate
                ? JSON.stringify(body.manualSessionTemplate, null, 2)
                : ""),
          }));
          if (body.manualSessionUrl) {
            setManualSessionGuide({
              platform: bindingForm.platform,
              url: body.manualSessionUrl,
              message:
                body.reason === "captcha_required"
                  ? `${bindingForm.platform.toUpperCase()} 当前要求你先手动完成验证码，再把登录成功后的 Session 粘贴回来。`
                  : "当前平台需要你先在浏览器中手动完成登录，再把成功后的 Session 粘贴回来。",
            });
          }
        }

        setBindingError(errorMsg);
        return;
      }

      setBindingForm({
        childId: "",
        platform: "ixl",
        username: "",
        authMode: "auto_login",
        loginUsername: "",
        loginPassword: "",
        managedSessionPayloadText: "",
        managedSessionCapturedAt: "",
      });

      if (parentId) {
        await refreshData(parentId);
      }
    } finally {
      setBindingLoading(false);
    }
  };

  const handleRefreshSession = async (accountId: string, platform: string) => {
    try {
      const response = await fetch(
        `/api/platform-connections/${accountId}/refresh-session`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        if (
          ["captcha_required", "two_factor_required", "unsupported"].includes(
            body.reason
          )
        ) {
          setTakeoverAccountId(accountId);
          setTakeoverPayload(
            platform === "ixl"
              ? '{"cookies":[{"name":"PHPSESSID","value":""},{"name":"ixl_user","value":""}]}'
              : '{"cookies":[{"name":"KAAS","value":""}]}'
          );
          return;
        }
        alert(body.error || "刷新 Session 失败");
        return;
      }

      if (parentId) {
        await refreshData(parentId);
      }
      alert("Session 刷新成功");
    } catch {
      alert("刷新 Session 时发生网络错误");
    }
  };

  const handleTakeoverSave = async (accountId: string) => {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(takeoverPayload);
    } catch {
      alert("JSON 格式不正确");
      return;
    }

    setTakeoverLoading(true);
    try {
      const response = await fetch(
        `/api/platform-connections/${accountId}/manual-session`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ managedSessionPayload: payload }),
        }
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        alert(body.error || "保存失败");
        return;
      }

      setTakeoverAccountId(null);
      setTakeoverPayload("");
      if (parentId) {
        await refreshData(parentId);
      }
    } catch {
      alert("保存时发生网络错误");
    } finally {
      setTakeoverLoading(false);
    }
  };

  const handleDeleteAccount = async (accountId: string) => {
    setDeleteLoading(true);
    try {
      const response = await fetch(`/api/platform-connections/${accountId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        alert(body.error || "删除账号失败");
        return;
      }

      setDeleteConfirmId(null);
      if (parentId) {
        await refreshData(parentId);
      }
    } catch {
      alert("删除时发生网络错误");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleEditCredentialSave = async (accountId: string) => {
    if (!editCredentialPassword) {
      alert("请输入新密码");
      return;
    }
    setEditCredentialLoading(true);
    try {
      const response = await fetch("/api/platform-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          childId: platformAccounts.find((a) => a.id === accountId)?.child_id,
          platform: platformAccounts.find((a) => a.id === accountId)?.platform,
          username: platformAccounts.find((a) => a.id === accountId)?.external_account_ref,
          authMode: "auto_login",
          loginUsername: editCredentialUsername || platformAccounts.find((a) => a.id === accountId)?.external_account_ref,
          loginPassword: editCredentialPassword,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        alert(body.error || "更新凭据失败");
        return;
      }

      setEditCredentialId(null);
      setEditCredentialUsername("");
      setEditCredentialPassword("");
      if (parentId) {
        await refreshData(parentId);
      }
    } catch {
      alert("更新凭据时发生网络错误");
    } finally {
      setEditCredentialLoading(false);
    }
  };

  const populateForm = (account: PlatformAccount) => {
    setBindingForm({
      childId: account.child_id,
      platform: account.platform as SupportedPlatform,
      username: account.external_account_ref,
      authMode: (account.auth_mode as "auto_login" | "manual_session") ?? "manual_session",
      loginUsername: "",
      loginPassword: "",
      managedSessionPayloadText: "",
      managedSessionCapturedAt: "",
    });
    setManualSessionGuide(null);
    setBindingError(null);
  };

  const toggleExpand = (accountId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) {
        next.delete(accountId);
      } else {
        next.add(accountId);
      }
      return next;
    });
  };

  const formatDateTime = (iso: string | null) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const statusLabel = (status: string, autoLogin?: boolean | null) => {
    if (status === "active") return "正常";
    if (status === "attention_required") return autoLogin ? "需重新登录" : "需补录 Session";
    if (status === "syncing") return "同步中";
    if (status === "failed") return "同步失败";
    return status;
  };

  const handleGroupAdd = async () => {
    setGroupAddError(null);
    if (!groupAddForm.recipientRef.trim()) {
      setGroupAddError("请输入微信群标识。");
      return;
    }
    setGroupAddLoading(true);
    try {
      const { error } = await supabase.from("wechat_groups").insert({
        parent_id: parentId,
        recipient_ref: groupAddForm.recipientRef.trim(),
        display_name: groupAddForm.displayName.trim() || null,
        source: "manual",
      });
      if (error) {
        if (error.message.includes("duplicate")) {
          setGroupAddError("这个群标识已经存在了。");
        } else {
          setGroupAddError(error.message);
        }
        return;
      }
      setGroupAddForm({ recipientRef: "", displayName: "" });
      setShowGroupAddForm(false);
      if (parentId) await refreshData(parentId);
    } finally {
      setGroupAddLoading(false);
    }
  };

  const handleGroupEdit = async (groupId: string) => {
    setGroupEditLoading(true);
    try {
      const { error } = await supabase
        .from("wechat_groups")
        .update({ display_name: groupEditName.trim() || null })
        .eq("id", groupId);
      if (!error) {
        setGroupEditingId(null);
        if (parentId) await refreshData(parentId);
      }
    } finally {
      setGroupEditLoading(false);
    }
  };

  const handleGroupDelete = async (groupId: string) => {
    if (!confirm("确定要删除这个微信群吗？相关的消息路由也会失效。")) return;
    await supabase.from("wechat_groups").delete().eq("id", groupId);
    if (parentId) await refreshData(parentId);
  };

  return (
    <SettingsShell
      title="孩子集成"
      description="这里管理孩子自己的学习平台账号和默认消息路由，不处理家庭级通知通道。"
      backHref="/settings"
    >
        {/* Child tab bar */}
        {children.length > 1 && (
          <div className="flex flex-wrap gap-2" role="tablist">
            {children.map((child) => (
              <button
                key={child.id}
                role="tab"
                aria-selected={selectedChildId === child.id}
                onClick={() => {
                  setSelectedChildId(child.id);
                  setBindingForm((prev) => ({
                    ...prev,
                    childId: child.id,
                    username: "",
                    loginUsername: "",
                    loginPassword: "",
                    managedSessionPayloadText: "",
                    managedSessionCapturedAt: "",
                  }));
                  setBindingError(null);
                  setManualSessionGuide(null);
                  router.replace(`/settings/integrations?childId=${child.id}`, { scroll: false });
                }}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  selectedChildId === child.id
                    ? "bg-primary text-white"
                    : "bg-forest-50 text-forest-600 hover:bg-forest-100"
                }`}
              >
                {child.avatar} {child.name}
              </button>
            ))}
          </div>
        )}

        {!selectedChildId && (
          <div className="rounded-xl border border-dashed border-forest-200 bg-forest-50 px-4 py-5 text-center text-sm text-forest-500">
            请选择一个孩子开始配置
          </div>
        )}

      <Card id="platform-binding" className="scroll-mt-4">
        <div className="space-y-4">
          <div>
            <h2 className="font-bold text-forest-700">学习平台账号</h2>
            <p className="mt-1 text-sm text-forest-500">
              孩子级绑定只负责"这个孩子在外部学习平台上是谁"，不直接决定具体作业或家庭通道。
            </p>
          </div>

          <div className="space-y-4">
            {/* Auth Mode Toggle */}
            <div className="flex rounded-xl border-2 border-forest-200 p-1">
              <button
                type="button"
                onClick={() =>
                  setBindingForm((prev) =>
                    AUTO_LOGIN_PLATFORMS.has(prev.platform)
                      ? { ...prev, authMode: "auto_login" }
                      : prev
                  )
                }
                disabled={!AUTO_LOGIN_PLATFORMS.has(bindingForm.platform)}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  bindingForm.authMode === "auto_login"
                    ? "bg-primary text-white"
                    : "text-forest-600 hover:bg-forest-50"
                }`}
              >
                自动登录（IXL / Khan）
              </button>
              <button
                type="button"
                onClick={() =>
                  setBindingForm((prev) => ({ ...prev, authMode: "manual_session" }))
                }
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  bindingForm.authMode === "manual_session"
                    ? "bg-primary text-white"
                    : "text-forest-600 hover:bg-forest-50"
                }`}
              >
                手动 Session
              </button>
            </div>



            <div>
              <label htmlFor="platform-name" className="mb-1 block text-sm font-medium text-forest-700">
                平台
              </label>
              <select
                id="platform-name"
                value={bindingForm.platform}
                onChange={(e) =>
                  setBindingForm((prev) => {
                    const platform = e.target.value as SupportedPlatform;
                    return {
                      ...prev,
                      platform,
                      authMode: AUTO_LOGIN_PLATFORMS.has(platform)
                        ? prev.authMode
                        : "manual_session",
                    };
                  })
                }
                className="w-full rounded-xl border-2 border-forest-200 bg-white px-4 py-2 focus:border-primary focus:outline-none"
              >
                <option value="ixl">IXL</option>
                <option value="khan-academy">Khan Academy</option>
                <option value="raz-kids">Raz-Kids</option>
                <option value="epic">Epic</option>
              </select>
            </div>

            <Input
              label="账号标识"
              value={bindingForm.username}
              onChange={(e) =>
                setBindingForm((prev) => ({ ...prev, username: e.target.value }))
              }
              placeholder="例如 mia-family-account"
            />

            {bindingForm.authMode === "auto_login" ? (
              <>
                <Input
                  label="登录用户名"
                  value={bindingForm.loginUsername}
                  onChange={(e) =>
                    setBindingForm((prev) => ({ ...prev, loginUsername: e.target.value }))
                  }
                  placeholder="留空则使用上面的账号标识"
                />
                <Input
                  label="登录密码"
                  type="password"
                  value={bindingForm.loginPassword}
                  onChange={(e) =>
                    setBindingForm((prev) => ({ ...prev, loginPassword: e.target.value }))
                  }
                  placeholder="平台登录密码"
                />
              </>
            ) : (
              <>
                {!AUTO_LOGIN_PLATFORMS.has(bindingForm.platform) ? (
                  <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                    {getPlatformDisplayName(bindingForm.platform)} 目前先接入手动
                    Session 绑定，自动登录后续再补。请在 JSON 里同时提供活动页
                    `activityUrl` 和登录后的 `cookies`。
                  </div>
                ) : null}
                {manualSessionGuide ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    <p className="font-medium">{manualSessionGuide.message}</p>
                    <ol className="mt-2 list-decimal space-y-1 pl-5">
                      <li>先打开平台登录页并完成验证码或登录验证</li>
                      <li>登录成功后，进入学习记录/活动页，并复制该页面 URL</li>
                      <li>把活动页 URL 和当前浏览器里的 Cookie 按下面 JSON 结构粘贴回来</li>
                      <li>保存后系统会优先复用这次 Session，减少后续打断</li>
                    </ol>
                    <a
                      href={manualSessionGuide.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex text-sm font-medium text-primary underline"
                    >
                      打开 {getPlatformDisplayName(manualSessionGuide.platform)} 登录页
                    </a>
                  </div>
                ) : null}
                <div>
                  <label htmlFor="managed-session-payload" className="mb-1 block text-sm font-medium text-forest-700">
                    Managed Session JSON
                  </label>
                  <textarea
                    id="managed-session-payload"
                    value={bindingForm.managedSessionPayloadText}
                    onChange={(e) =>
                      setBindingForm((prev) => ({
                        ...prev,
                        managedSessionPayloadText: e.target.value,
                      }))
                    }
                    placeholder={
                      bindingForm.platform === "epic" ||
                      bindingForm.platform === "raz-kids"
                        ? '例如 {"activityUrl":"https://...","cookies":[{"name":"session","value":"..."}]}'
                        : '例如 {"cookies":[{"name":"PHPSESSID","value":"..."}]}'
                    }
                    className="min-h-28 w-full rounded-xl border-2 border-forest-200 px-4 py-3 focus:border-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="managed-session-captured-at" className="mb-1 block text-sm font-medium text-forest-700">
                    Session 捕获时间（可选）
                  </label>
                  <input
                    id="managed-session-captured-at"
                    type="datetime-local"
                    value={bindingForm.managedSessionCapturedAt}
                    onChange={(e) =>
                      setBindingForm((prev) => ({
                        ...prev,
                        managedSessionCapturedAt: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border-2 border-forest-200 bg-white px-4 py-2 focus:border-primary focus:outline-none"
                  />
                </div>
              </>
            )}

            {bindingError ? <p className="text-sm text-rose-700">{bindingError}</p> : null}

            <div className="flex justify-end">
              <Button disabled={bindingLoading} onClick={handleBindingSubmit}>
                {bindingLoading
                  ? "绑定中..."
                  : bindingForm.authMode === "auto_login"
                    ? "测试登录并绑定"
                    : "绑定账号"}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {(() => {
              const filteredAccounts = platformAccounts.filter((a) => a.child_id === selectedChildId);
              if (filteredAccounts.length === 0) {
                return (
                  <div className="rounded-xl border border-dashed border-forest-200 bg-forest-50 px-4 py-5 text-sm text-forest-500">
                    {"这个孩子还没有绑定学习平台账号。"}
                  </div>
                );
              }
              return filteredAccounts.map((account) => {
                const isExpanded = expandedIds.has(account.id);
                const childName = children.find((child) => child.id === account.child_id)?.name ?? "未命名孩子";
                const hasCredentials = Boolean(account.login_credentials_encrypted);

                return (
                <div
                  key={account.id}
                  className="rounded-xl border border-forest-100 bg-forest-50/70 px-4 py-3 text-sm text-forest-600"
                >
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-forest-700">
                      {childName} · {getPlatformDisplayName(account.platform)}
                    </p>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => populateForm(account)}
                      >
                        编辑
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleExpand(account.id)}
                      >
                        {isExpanded ? "收起" : "详情"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeleteConfirmId(account.id)}
                      >
                        删除
                      </Button>
                    </div>
                  </div>

                  <p>账号：{account.external_account_ref}</p>
                  <p>
                    状态：{statusLabel(account.status, account.auto_login_enabled)}
                    {account.auth_mode === "auto_login" ? " · 自动登录" : " · 手动 Session"}
                    {hasCredentials ? " · 凭据已存储" : ""}
                  </p>

                  {/* Expandable details */}
                  {isExpanded && (
                    <div className="mt-2 space-y-1 border-t border-forest-200 pt-2 text-xs text-forest-500">
                      <p>上次同步：{formatDateTime(account.last_synced_at)}</p>
                      <p>Session 捕获：{formatDateTime(account.managed_session_captured_at)}</p>
                      {account.managed_session_expires_at && (
                        <p>Session 过期：{formatDateTime(account.managed_session_expires_at)}</p>
                      )}
                      <p>凭据存储：{hasCredentials ? "已加密存储" : "未存储"}</p>
                      {account.auto_login_enabled && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditCredentialId(account.id);
                            setEditCredentialUsername("");
                            setEditCredentialPassword("");
                          }}
                        >
                          编辑凭据
                        </Button>
                      )}
                    </div>
                  )}

                  {account.last_sync_error_summary ? (
                    <p className="mt-1 text-rose-600">{account.last_sync_error_summary}</p>
                  ) : null}

                  {/* Action buttons */}
                  <div className="mt-2 flex items-center gap-1 border-t border-forest-200 pt-2">
                    {account.status === "attention_required" && account.auto_login_enabled && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRefreshSession(account.id, account.platform)}
                      >
                        刷新登录
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setTakeoverAccountId(account.id);
                        setTakeoverPayload(
                          account.platform === "ixl"
                            ? '{"cookies":[{"name":"PHPSESSID","value":""},{"name":"ixl_user","value":""}]}'
                            : account.platform === "khan-academy"
                              ? '{"cookies":[{"name":"KAAS","value":""}]}'
                              : '{"activityUrl":"","cookies":[]}'
                        );
                      }}
                    >
                      手动更新 Session
                    </Button>
                  </div>

                  {/* Takeover panel */}
                  {takeoverAccountId === account.id && (
                    <div className="mt-3 space-y-3 border-t border-forest-200 pt-3">
                      <p className="text-amber-800">
                        请选择以下任一方式更新 Session：
                      </p>

                      <div className="flex rounded-lg border border-forest-200 p-0.5">
                        <button
                          type="button"
                          onClick={() => setTakeoverMethod("script")}
                          className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                            takeoverMethod === "script"
                              ? "bg-primary text-white"
                              : "text-forest-600 hover:bg-forest-50"
                          }`}
                        >
                          方式一：本地脚本（推荐）
                        </button>
                        <button
                          type="button"
                          onClick={() => setTakeoverMethod("manual")}
                          className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                            takeoverMethod === "manual"
                              ? "bg-primary text-white"
                              : "text-forest-600 hover:bg-forest-50"
                          }`}
                        >
                          方式二：手动粘贴
                        </button>
                      </div>

                      {takeoverMethod === "script" ? (
                        <div className="space-y-3">
                          <div className="rounded-lg bg-forest-50 px-3 py-2.5 text-xs text-forest-600">
                            <p className="font-medium text-forest-700 mb-1">使用步骤：</p>
                            <ol className="list-decimal space-y-0.5 pl-4">
                              <li>在终端运行以下命令</li>
                              <li>浏览器窗口会自动弹出</li>
                              <li>手动完成登录（包括验证码）</li>
                              <li>回到终端按 Enter，JSON 自动复制到剪贴板</li>
                              <li>回到此页面，点击下方「我已获取，直接粘贴」</li>
                            </ol>
                          </div>

                          <div className="flex items-center gap-2">
                            <code className="flex-1 rounded-lg bg-slate-100 px-3 py-2 text-xs font-mono text-slate-700">
                              npm run session:collect -- --platform={account.platform}
                            </code>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                navigator.clipboard.writeText(
                                  `npm run session:collect -- --platform=${account.platform}`
                                );
                                setCopiedCommand(true);
                                setTimeout(() => setCopiedCommand(false), 2000);
                              }}
                            >
                              {copiedCommand ? "已复制" : "复制命令"}
                            </Button>
                          </div>

                          <p className="text-xs text-forest-500">
                            首次使用需要先安装 Playwright：
                            <code className="mx-1 rounded bg-slate-100 px-1 py-0.5 font-mono text-slate-600">
                              npm install playwright && npx playwright install chromium
                            </code>
                          </p>

                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              onClick={() => {
                                setTakeoverMethod("manual");
                                setTakeoverPayload(
                                  account.platform === "ixl"
                                    ? '{"cookies":[{"name":"PHPSESSID","value":""},{"name":"ixl_user","value":""}]}'
                                    : account.platform === "khan-academy"
                                      ? '{"cookies":[{"name":"KAAS","value":""}]}'
                                      : '{"activityUrl":"","cookies":[]}'
                                );
                              }}
                            >
                              我已获取，直接粘贴
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setTakeoverAccountId(null);
                                setTakeoverPayload("");
                              }}
                            >
                              取消
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <a
                            href={getManualSessionLoginUrl(account.platform)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex text-sm font-medium text-primary underline"
                          >
                            打开 {getPlatformDisplayName(account.platform)} 登录页
                          </a>
                          <textarea
                            value={takeoverPayload}
                            onChange={(e) => setTakeoverPayload(e.target.value)}
                            placeholder='{"cookies":[{"name":"PHPSESSID","value":"..."}]}'
                            className="min-h-24 w-full rounded-xl border-2 border-forest-200 bg-white px-4 py-3 text-sm text-forest-800 focus:border-primary focus:outline-none"
                          />
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              disabled={takeoverLoading}
                              onClick={() => handleTakeoverSave(account.id)}
                            >
                              {takeoverLoading ? "保存中..." : "保存 Session"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={takeoverLoading}
                              onClick={() => {
                                setTakeoverAccountId(null);
                                setTakeoverPayload("");
                              }}
                            >
                              取消
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Edit credentials panel */}
                  {editCredentialId === account.id && (
                    <div className="mt-3 space-y-3 border-t border-forest-200 pt-3">
                      <p className="font-medium text-forest-700">更新登录凭据</p>
                      <Input
                        label="登录用户名"
                        value={editCredentialUsername}
                        onChange={(e) => setEditCredentialUsername(e.target.value)}
                        placeholder={account.external_account_ref}
                      />
                      <Input
                        label="新密码"
                        type="password"
                        value={editCredentialPassword}
                        onChange={(e) => setEditCredentialPassword(e.target.value)}
                        placeholder="输入新密码"
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          disabled={editCredentialLoading}
                          onClick={() => handleEditCredentialSave(account.id)}
                        >
                          {editCredentialLoading ? "验证并保存..." : "验证并保存"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditCredentialId(null);
                            setEditCredentialUsername("");
                            setEditCredentialPassword("");
                          }}
                        >
                          取消
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Delete confirmation */}
                  {deleteConfirmId === account.id && (
                    <div className="mt-3 space-y-3 border-t border-rose-200 pt-3">
                      <p className="text-rose-700">
                        确定要删除 {childName} 的 {getPlatformDisplayName(account.platform)} 账号绑定吗？该操作不可撤销。
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          disabled={deleteLoading}
                          onClick={() => handleDeleteAccount(account.id)}
                        >
                          {deleteLoading ? "删除中..." : "确认删除"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={deleteLoading}
                          onClick={() => setDeleteConfirmId(null)}
                        >
                          取消
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );});
            })()}
          </div>
        </div>
      </Card>

      {selectedChildId && (
        <Card id="default-group" className="scroll-mt-4">
          <div className="space-y-4">
            <div>
              <h2 className="font-bold text-forest-700">默认微信群</h2>
              <p className="mt-1 text-sm text-forest-500">
                孩子提交作业的默认目标微信群；作业级覆盖在作业编辑时确定。
              </p>
            </div>

            {(() => {
              const child = children.find((c) => c.id === selectedChildId);
              if (!child) return null;
              return (
                <div className="rounded-xl border border-forest-100 bg-forest-50/70 px-4 py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div className="flex-1">
                      <label
                        htmlFor="default-group-select"
                        className="mb-1 block text-sm font-medium text-forest-700"
                      >
                        {child.name} 默认群
                      </label>
                      <select
                        id="default-group-select"
                        value={childGroupSelections[child.id] ?? ""}
                        onChange={(e) =>
                          setChildGroupSelections((prev) => ({
                            ...prev,
                            [child.id]: e.target.value,
                          }))
                        }
                        className="w-full rounded-xl border-2 border-forest-200 bg-white px-4 py-2 focus:border-primary focus:outline-none"
                      >
                        <option value="">暂不设置默认群</option>
                        {wechatGroups.map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.display_name || group.recipient_ref}
                          </option>
                        ))}
                      </select>
                    </div>

                    <Button
                      size="sm"
                      disabled={savingChildGroupId === child.id}
                      onClick={async () => {
                        setSavingChildGroupId(child.id);
                        try {
                          await supabase
                            .from("children")
                            .update({
                              default_wechat_group_id:
                                childGroupSelections[child.id] || null,
                            })
                            .eq("id", child.id);
                          if (parentId) {
                            await refreshData(parentId);
                          }
                        } finally {
                          setSavingChildGroupId(null);
                        }
                      }}
                    >
                      {savingChildGroupId === child.id ? "保存中..." : "保存"}
                    </Button>
                  </div>
                </div>
              );
            })()}
          </div>
        </Card>
      )}

      {selectedChildId && (
        <Card id="wechat-groups" className="scroll-mt-4">
          <div className="space-y-4">
            <div>
              <h2 className="font-bold text-forest-700">微信群管理</h2>
              <p className="mt-1 text-sm text-forest-500">
                管理你的目标微信群，系统自动发现活跃群，也可以手动添加。
              </p>
            </div>

            <div className="space-y-2">
              {wechatGroups.length === 0 ? (
                <div className="rounded-xl border border-dashed border-forest-200 bg-forest-50 px-4 py-5 text-sm text-forest-500">
                  还没有微信群。启动微信发送服务并在目标群里发一条消息，系统会自动发现。
                </div>
              ) : (
                wechatGroups.map((group) => (
                  <div
                    key={group.id}
                    className="flex items-center justify-between rounded-xl border border-forest-100 bg-forest-50/70 px-4 py-3"
                  >
                    {groupEditingId === group.id ? (
                      <div className="flex flex-1 items-center gap-2">
                        <input
                          type="text"
                          value={groupEditName}
                          onChange={(e) => setGroupEditName(e.target.value)}
                          placeholder="群显示名称"
                          className="flex-1 rounded-lg border border-forest-200 px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
                          autoFocus
                        />
                        <Button
                          size="sm"
                          disabled={groupEditLoading}
                          onClick={() => handleGroupEdit(group.id)}
                        >
                          {groupEditLoading ? "保存中..." : "保存"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setGroupEditingId(null)}
                        >
                          取消
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="text-sm">
                          <p className="font-medium text-forest-700">
                            {group.display_name || "未命名群"}
                          </p>
                          <p className="mt-0.5 text-xs text-forest-500">
                            {group.source === "manual" ? "手动添加" : "自动发现"}
                            {group.last_seen_at ? " · 最近已连接" : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setGroupEditingId(group.id);
                              setGroupEditName(group.display_name || "");
                            }}
                          >
                            编辑
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-500"
                            onClick={() => handleGroupDelete(group.id)}
                          >
                            删除
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>

            {showGroupAddForm ? (
              <div className="rounded-xl border border-forest-200 bg-white p-4 space-y-3">
                <p className="text-sm font-medium text-forest-700">手动添加微信群</p>
                <Input
                  label="微信群标识"
                  value={groupAddForm.recipientRef}
                  onChange={(e) =>
                    setGroupAddForm((prev) => ({ ...prev, recipientRef: e.target.value }))
                  }
                  placeholder="例如 wxid_xxx@chatroom"
                />
                <Input
                  label="显示名称（可选）"
                  value={groupAddForm.displayName}
                  onChange={(e) =>
                    setGroupAddForm((prev) => ({ ...prev, displayName: e.target.value }))
                  }
                  placeholder="例如 Mia 数学群"
                />
                {groupAddError ? (
                  <p className="text-sm text-rose-700">{groupAddError}</p>
                ) : null}
                <div className="flex items-center gap-2">
                  <Button size="sm" disabled={groupAddLoading} onClick={handleGroupAdd}>
                    {groupAddLoading ? "添加中..." : "添加"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setShowGroupAddForm(false);
                      setGroupAddForm({ recipientRef: "", displayName: "" });
                      setGroupAddError(null);
                    }}
                  >
                    取消
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setShowGroupAddForm(true)}
              >
                + 手动添加微信群
              </Button>
            )}
          </div>
        </Card>
      )}

      {selectedChildId && (
        <Card id="message-routing" className="scroll-mt-4">
          <div className="space-y-4">
            {(() => {
              const filteredRules = routingRules.filter((r) => r.child_id === selectedChildId);
              if (filteredRules.length === 0) return null;
              return (
                <>
                  <div>
                    <h3 className="font-medium text-forest-700">遗留路由规则</h3>
                    <p className="mt-1 text-sm text-forest-500">
                      以下规则来自旧版系统，仅做展示参考，不再支持新增和编辑。
                    </p>
                  </div>
                  <div className="space-y-2">
                    {filteredRules.map((rule) => (
                      <div
                        key={rule.id}
                        className="rounded-xl border border-forest-100 bg-forest-50/70 px-4 py-3 text-sm text-forest-600"
                      >
                        <p className="font-medium text-forest-700">
                          {children.find((child) => child.id === rule.child_id)?.name ?? "未命名孩子"} ·{" "}
                          {rule.channel === "telegram_chat" ? "Telegram" : "微信群"}
                        </p>
                        <p>
                          {rule.homework_id
                            ? `作业：${homeworkTitleById[rule.homework_id] ?? "未找到作业"}`
                            : "作业：该孩子默认路由"}
                        </p>
                        <p>
                          目标：{rule.recipient_label || rule.recipient_ref}
                          {rule.recipient_label ? ` (${rule.recipient_ref})` : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
        </Card>
      )}
    </SettingsShell>
  );
}
