"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SettingsShell } from "@/components/parent/SettingsShell";
import { ReminderSettings } from "@/components/parent/ReminderSettings";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { Database } from "@/lib/supabase/types";

type Parent = Database["public"]["Tables"]["parents"]["Row"];
type WeChatGroup = Database["public"]["Tables"]["wechat_groups"]["Row"];

export default function SettingsChannelsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [parent, setParent] = useState<Parent | null>(null);
  const [wechatGroups, setWechatGroups] = useState<WeChatGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [bridgeHealthLoading, setBridgeHealthLoading] = useState(false);
  const [bridgeHealthMessage, setBridgeHealthMessage] = useState<string | null>(
    null
  );
  const [bridgeHealthTone, setBridgeHealthTone] = useState<
    "neutral" | "success" | "danger"
  >("neutral");

  // Manual add form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({
    recipientRef: "",
    displayName: "",
  });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Edit mode
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  const fetchGroups = async (parentId: string) => {
    const { data: groups } = await supabase
      .from("wechat_groups")
      .select("*")
      .eq("parent_id", parentId)
      .order("created_at", { ascending: false });

    if (groups) {
      setWechatGroups(groups as WeChatGroup[]);
    }
  };

  useEffect(() => {
    const fetchParent = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("parents")
        .select("*")
        .eq("id", session.user.id)
        .single();

      if (data) {
        setParent(data);
        await fetchGroups(data.id);
      }
      setLoading(false);
    };

    fetchParent();
  }, [supabase]);

  if (loading || !parent) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-2xl">加载中...</div>
      </div>
    );
  }

  const handleAddGroup = async () => {
    setAddError(null);
    if (!addForm.recipientRef.trim()) {
      setAddError("请输入微信群标识。");
      return;
    }

    setAddLoading(true);
    try {
      const { error } = await supabase.from("wechat_groups").insert({
        parent_id: parent.id,
        recipient_ref: addForm.recipientRef.trim(),
        display_name: addForm.displayName.trim() || null,
        source: "manual",
      });

      if (error) {
        if (error.message.includes("duplicate")) {
          setAddError("这个群标识已经存在了。");
        } else {
          setAddError(error.message);
        }
        return;
      }

      setAddForm({ recipientRef: "", displayName: "" });
      setShowAddForm(false);
      await fetchGroups(parent.id);
    } finally {
      setAddLoading(false);
    }
  };

  const handleUpdateGroup = async (groupId: string) => {
    setEditLoading(true);
    try {
      const { error } = await supabase
        .from("wechat_groups")
        .update({ display_name: editDisplayName.trim() || null })
        .eq("id", groupId);

      if (!error) {
        setEditingId(null);
        await fetchGroups(parent.id);
      }
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm("确定要删除这个微信群吗？相关的消息路由也会失效。")) {
      return;
    }
    await supabase.from("wechat_groups").delete().eq("id", groupId);
    await fetchGroups(parent.id);
  };

  return (
    <SettingsShell
      title="家庭通知通道"
      description="管理微信群、Telegram 等家庭级通知通道。"
    >
      <Card id="wechat-groups" className="scroll-mt-4">
        <div className="space-y-4">
          <div>
            <h2 className="font-bold text-forest-700">微信群管理</h2>
            <p className="mt-1 text-sm text-forest-500">
              这里管理你的目标微信群。系统会自动发现已在 Bridge 中活跃的群，你也可以手动添加。
            </p>
          </div>

          {/* Discovered groups list */}
          <div className="space-y-2">
            {wechatGroups.length === 0 ? (
              <div className="rounded-xl border border-dashed border-forest-200 bg-forest-50 px-4 py-5 text-sm text-forest-500">
                还没有可选的微信群。
                {wechatGroups.length === 0 && (
                  <span>
                    启动微信发送服务并在目标群里发一条消息，系统会自动发现它。你也可以手动添加。
                  </span>
                )}
              </div>
            ) : (
              wechatGroups.map((group) => (
                <div
                  key={group.id}
                  className="flex items-center justify-between rounded-xl border border-forest-100 bg-forest-50/70 px-4 py-3"
                >
                  {editingId === group.id ? (
                    <div className="flex flex-1 items-center gap-2">
                      <input
                        type="text"
                        value={editDisplayName}
                        onChange={(e) => setEditDisplayName(e.target.value)}
                        placeholder="群显示名称"
                        className="flex-1 rounded-lg border border-forest-200 px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
                        autoFocus
                      />
                      <Button
                        size="sm"
                        disabled={editLoading}
                        onClick={() => handleUpdateGroup(group.id)}
                      >
                        {editLoading ? "保存中..." : "保存"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingId(null)}
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
                            setEditingId(group.id);
                            setEditDisplayName(group.display_name || "");
                          }}
                        >
                          编辑
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-500"
                          onClick={() => handleDeleteGroup(group.id)}
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

          {/* Add group form */}
          {showAddForm ? (
            <div className="rounded-xl border border-forest-200 bg-white p-4 space-y-3">
              <p className="text-sm font-medium text-forest-700">手动添加微信群</p>
              <Input
                label="微信群标识"
                value={addForm.recipientRef}
                onChange={(e) =>
                  setAddForm((prev) => ({ ...prev, recipientRef: e.target.value }))
                }
                placeholder="例如 wxid_xxx@chatroom"
              />
              <Input
                label="显示名称（可选）"
                value={addForm.displayName}
                onChange={(e) =>
                  setAddForm((prev) => ({ ...prev, displayName: e.target.value }))
                }
                placeholder="例如 Mia 数学群"
              />
              {addError ? (
                <p className="text-sm text-rose-700">{addError}</p>
              ) : null}
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  disabled={addLoading}
                  onClick={handleAddGroup}
                >
                  {addLoading ? "添加中..." : "添加"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowAddForm(false);
                    setAddForm({ recipientRef: "", displayName: "" });
                    setAddError(null);
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
              onClick={() => setShowAddForm(true)}
            >
              + 手动添加微信群
            </Button>
          )}
        </div>
      </Card>

      <Card id="wechat-setup" className="scroll-mt-4">
        <div className="space-y-4">
          <div>
            <h2 className="font-bold text-forest-700">微信发送服务</h2>
            <p className="mt-1 text-sm text-forest-500">
              录音作业的推送依赖一个微信发送服务。首次使用需要扫码授权，之后自动保持登录。
            </p>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-medium">初次设置步骤</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>运行 <code className="rounded bg-amber-100 px-1">npm run dev:with-bridge</code> 启动应用和发送服务</li>
              <li>终端会显示一个二维码链接，用微信扫码授权登录</li>
              <li>在目标微信群里发一条消息，服务会自动发现这个群</li>
              <li>上面"微信群管理"里会出现新发现的群，你可以给它改个好记的名字</li>
            </ol>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              size="sm"
              variant="secondary"
              disabled={bridgeHealthLoading}
              onClick={async () => {
                setBridgeHealthLoading(true);
                setBridgeHealthMessage(null);
                setBridgeHealthTone("neutral");

                try {
                  const response = await fetch("/api/voice-push/bridge-health", {
                    method: "GET",
                  });
                  const body = await response.json();

                  if (!response.ok) {
                    setBridgeHealthTone("danger");
                    setBridgeHealthMessage(
                      body.error || "发送服务自检失败，请检查是否已启动。"
                    );
                    return;
                  }

                  if (body.status === "healthy") {
                    setBridgeHealthTone("success");
                    setBridgeHealthMessage(
                      body.deliveredCount === null
                        ? `发送服务可访问：${body.healthUrl}`
                        : `发送服务可访问：${body.healthUrl}，已发送 ${body.deliveredCount} 条任务。`
                    );
                    return;
                  }

                  setBridgeHealthTone("danger");
                  setBridgeHealthMessage(
                    body.error || "发送服务可达，但健康检查没有通过。"
                  );
                } catch (error) {
                  setBridgeHealthTone("danger");
                  setBridgeHealthMessage(
                    error instanceof Error
                      ? error.message
                      : "发送服务自检失败，请稍后重试。"
                  );
                } finally {
                  setBridgeHealthLoading(false);
                }
              }}
            >
              {bridgeHealthLoading ? "检查中..." : "检查发送服务状态"}
            </Button>

            {bridgeHealthMessage ? (
              <p
                className={`text-sm ${
                  bridgeHealthTone === "success"
                    ? "text-emerald-700"
                    : bridgeHealthTone === "danger"
                      ? "text-rose-700"
                      : "text-forest-600"
                }`}
              >
                {bridgeHealthMessage}
              </p>
            ) : null}
          </div>
        </div>
      </Card>

      <Card id="reminder-settings" className="scroll-mt-4">
        <h2 className="mb-4 font-bold text-forest-700">提醒与 Telegram 通道</h2>
        <p className="mb-4 text-sm text-forest-500">
          Telegram 通道在这里保存家庭级 Chat ID 和接收人备注；Bot Token 由服务端运行环境统一提供。
        </p>
        <ReminderSettings
          settings={parent}
          onUpdate={() => window.location.reload()}
        />
      </Card>
    </SettingsShell>
  );
}
