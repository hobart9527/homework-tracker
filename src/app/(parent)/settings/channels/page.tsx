"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SettingsShell } from "@/components/parent/SettingsShell";
import { ReminderSettings } from "@/components/parent/ReminderSettings";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { Database } from "@/lib/supabase/types";

type Parent = Database["public"]["Tables"]["parents"]["Row"];

export default function SettingsChannelsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [parent, setParent] = useState<Parent | null>(null);
  const [loading, setLoading] = useState(true);
  const [bridgeHealthLoading, setBridgeHealthLoading] = useState(false);
  const [bridgeHealthMessage, setBridgeHealthMessage] = useState<string | null>(
    null
  );
  const [bridgeHealthTone, setBridgeHealthTone] = useState<
    "neutral" | "success" | "danger"
  >("neutral");

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

  return (
    <SettingsShell
      title="家庭通知通道"
      description="管理微信群、Telegram 等家庭级通知通道。微信群管理已移至孩子集成页。"
      backHref="/settings"
    >
      <Card className="scroll-mt-4">
        <div className="space-y-4">
          <div>
            <h2 className="font-bold text-forest-700">微信群管理</h2>
            <p className="mt-1 text-sm text-forest-500">
              微信群的管理（添加、编辑、删除、设置孩子默认群）已迁移至
              <a href="/settings/integrations" className="mx-1 text-primary underline">孩子集成页</a>，
              在那里你可以为每个孩子配置专属的微信群。
            </p>
          </div>
        </div>
      </Card>

      <Card id="wechat-setup" className="scroll-mt-4">
        <div className="space-y-4">
          <div>
            <h2 className="font-bold text-forest-700">企业微信发送服务</h2>
            <p className="mt-1 text-sm text-forest-500">
              使用企业微信官方 API 发送作业录音到群聊，无需额外启动服务或扫码登录。
            </p>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-medium">企业微信设置步骤</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>注册
                <a href="https://work.weixin.qq.com/" target="_blank" className="underline" rel="noreferrer">
                  企业微信
                </a>
                （免费），创建企业
              </li>
              <li>在「应用管理」中创建自建应用，获取 CorpID、CorpSecret 和 AgentID</li>
              <li>在环境变量中配置 <code className="rounded bg-amber-100 px-1">WECOM_CORPID</code>、
                <code className="rounded bg-amber-100 px-1">WECOM_CORPSECRET</code>、
                <code className="rounded bg-amber-100 px-1">WECOM_AGENTID</code>
              </li>
              <li>创建群聊并将应用加入群中，获取 chatid</li>
              <li>在孩子集成页添加群，标识填写 chatid</li>
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
                  const response = await fetch("/api/voice-push/wecom-status", {
                    method: "GET",
                  });
                  const body = await response.json();

                  if (body.configured) {
                    setBridgeHealthTone("success");
                    setBridgeHealthMessage(
                      `企业微信已配置（CorpID: ${body.corpidPreview}），可正常发送。`
                    );
                  } else {
                    setBridgeHealthTone("danger");
                    setBridgeHealthMessage(
                      "企业微信未配置，请在环境变量中设置 WECOM_CORPID 和 WECOM_CORPSECRET。"
                    );
                  }
                } catch (error) {
                  setBridgeHealthTone("danger");
                  setBridgeHealthMessage(
                    error instanceof Error
                      ? error.message
                      : "状态检查失败，请稍后重试。"
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
