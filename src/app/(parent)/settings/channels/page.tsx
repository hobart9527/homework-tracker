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
      description="这里是家长角色管理通道能力和接收方式的统一入口，不处理孩子身份绑定。"
    >
      <Card id="wechat-integration" className="scroll-mt-4">
        <div className="space-y-4">
          <div>
            <h2 className="font-bold text-forest-700">微信 Bridge 说明</h2>
            <p className="mt-1 text-sm text-forest-500">
              当前版本还没有应用内微信 OAuth 授权。首发采用 bridge/sender
              模式，由家庭级发送通道把录音或消息转发到微信侧。
            </p>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-medium">当前方案的边界</p>
            <p className="mt-1">
              应用本身不直接登录微信，也不直接识别微信群。应用只负责把录音文件和"该发给哪个群"的标识传给 bridge。
            </p>
            <p className="mt-1">
              真正把消息发进微信的能力，由基于 iLink Bot 协议的 bridge 进程负责。
            </p>
          </div>

          <div className="rounded-xl bg-forest-50 p-3 text-sm text-forest-600">
            <p>这个页面只负责家庭级能力：</p>
            <p>1. 说明当前微信接入方式。</p>
            <p>2. 配置 Telegram 这类家庭级接收通道。</p>
            <p>3. 把孩子和作业的目标路由留给其他对象层级去决定。</p>
          </div>

          <div className="rounded-xl border border-forest-100 bg-white px-4 py-4 text-sm text-forest-600">
            <p className="font-medium text-forest-700">微信群目标标识怎么填</p>
            <p className="mt-1">
              在"孩子集成 → 孩子默认消息路由"里，如果选择"微信群"，填写的不是微信群二维码，也不是应用内授权结果，而是微信群的实际 ID。
            </p>
            <p className="mt-1">
              启动 iLink Bridge 并在目标群里发一条消息后，Bridge 日志会打印群 ID（格式类似 <code>wxid_xxx@chatroom</code>）。把这个值填到"微信群标识"里即可。
            </p>
            <p className="mt-1">
              也可以先用示例 Bridge（mock）做链路验证，此时填任意自定义值（如 <code>wechat-group-math</code>）即可。
            </p>
          </div>

          <div className="rounded-xl border border-forest-100 bg-white px-4 py-4 text-sm text-forest-600">
            <p className="font-medium text-forest-700">本地测试步骤</p>
            <p className="mt-2 font-medium">方式一：示例 Bridge（验证链路，不真发微信）</p>
            <p className="mt-1">1. 在 `.env.local` 里配置：</p>
            <p className="mt-1 font-mono text-xs text-forest-700">
              VOICE_PUSH_BRIDGE_URL=http://127.0.0.1:4010/send
            </p>
            <p className="font-mono text-xs text-forest-700">
              VOICE_PUSH_BRIDGE_TOKEN=dev-bridge-token
            </p>
            <p className="mt-1">2. 另开终端运行 `npm run voice-push:bridge-example`。</p>
            <p className="mt-1">3. "孩子集成"里填任意自定义标识（如 `wechat-group-math`）。</p>
            <p className="mt-1">4. 提交带录音的打卡，到"系统运行"页点击"处理发送队列"。</p>
            <p className="mt-1">5. 示例 Bridge 控制台出现 `accepted` 日志即表示链路打通。</p>

            <p className="mt-3 font-medium">方式二：iLink Bot Bridge（真实发微信）</p>
            <p className="mt-1">1. 安装依赖：`npm install @pawastation/ilink-bot-sdk`</p>
            <p className="mt-1">2. 在 `.env.local` 里配置 `VOICE_PUSH_BRIDGE_URL`、`VOICE_PUSH_BRIDGE_TOKEN`、`SUPABASE_SERVICE_ROLE_KEY`</p>
            <p className="mt-1">3. 另开终端运行 `VOICE_PUSH_BRIDGE_TOKEN=dev-bridge-token npm run voice-push:bridge-ilink`</p>
            <p className="mt-1">4. 首次启动会输出 QR Code URL，用微信扫码授权</p>
            <p className="mt-1">5. 在目标微信群里发一条消息，Bridge 日志会打印群 ID</p>
            <p className="mt-1">6. "孩子集成"里把这个群 ID 填到"微信群标识"</p>
            <p className="mt-1">7. 提交带录音的打卡，到"系统运行"页点击"处理发送队列"</p>
            <p className="mt-1">8. 微信群应收到录音文件，Bridge 日志显示发送成功</p>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
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
                        body.error || "Bridge 自检失败，请检查环境变量和本地 bridge 进程。"
                      );
                      return;
                    }

                    if (body.status === "healthy") {
                      setBridgeHealthTone("success");
                      setBridgeHealthMessage(
                        body.deliveredCount === null
                          ? `Bridge 可访问：${body.healthUrl}`
                          : `Bridge 可访问：${body.healthUrl}，当前已接收 ${body.deliveredCount} 条任务。`
                      );
                      return;
                    }

                    setBridgeHealthTone("danger");
                    setBridgeHealthMessage(
                      body.error || "Bridge 可达，但健康检查没有通过。"
                    );
                  } catch (error) {
                    setBridgeHealthTone("danger");
                    setBridgeHealthMessage(
                      error instanceof Error
                        ? error.message
                        : "Bridge 自检失败，请稍后重试。"
                    );
                  } finally {
                    setBridgeHealthLoading(false);
                  }
                }}
              >
                {bridgeHealthLoading ? "检查中..." : "一键自检微信 Bridge"}
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
        </div>
      </Card>

      <Card id="reminder-settings" className="scroll-mt-4">
        <h2 className="mb-4 font-bold text-forest-700">提醒与 Telegram 通道</h2>
        <p className="mb-4 text-sm text-forest-500">
          Telegram 通道现在需要同时配置 Bot Token 和 Chat ID，才能进行真实发送与测试消息验证。
        </p>
        <ReminderSettings
          settings={parent}
          onUpdate={() => window.location.reload()}
        />
      </Card>
    </SettingsShell>
  );
}
