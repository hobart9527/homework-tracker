import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "@/app/(parent)/settings/page";
import SettingsChannelsPage from "@/app/(parent)/settings/channels/page";
import SettingsIntegrationsPage from "@/app/(parent)/settings/integrations/page";
import SettingsSystemPage from "@/app/(parent)/settings/system/page";

const fetchMock = vi.fn();
const searchParamsState = new URLSearchParams();
const updateChildEq = vi.fn().mockResolvedValue({ error: null });
const updateWeChatGroupEq = vi.fn().mockResolvedValue({ error: null });
const wechatGroupsState = [
  {
    id: "group-1",
    parent_id: "parent-1",
    recipient_ref: "wxid_math@chatroom",
    display_name: "Mia 数学老师群",
    source: "discovered",
    is_active: true,
    last_seen_at: "2026-04-21T10:00:00.000Z",
    created_at: "2026-04-20T09:00:00.000Z",
  },
  {
    id: "group-2",
    parent_id: "parent-1",
    recipient_ref: "wxid_reading@chatroom",
    display_name: "Mia 阅读老师群",
    source: "manual",
    is_active: true,
    last_seen_at: null,
    created_at: "2026-04-20T09:10:00.000Z",
  },
];

const sessionResponse = {
  data: {
    session: {
      user: { id: "parent-1" },
    },
  },
};

function createSupabaseClient() {
  return {
    auth: {
      getSession: vi.fn().mockResolvedValue(sessionResponse),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    from: vi.fn((table: string) => {
      if (table === "parents") {
        return {
          select: () => ({
            eq: () => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: "parent-1",
                  passcode: "0000",
                  reminder_cutoff_time: "20:00",
                  auto_remind_parent: true,
                  auto_remind_child: false,
                  quiet_hours_start: null,
                  quiet_hours_end: null,
                  telegram_chat_id: "123456789",
                  telegram_recipient_label: "家长通知",
                  created_at: "2026-04-01T00:00:00.000Z",
                },
              }),
            }),
          }),
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
        };
      }

      if (table === "custom_homework_types") {
        return {
          select: () => ({
            eq: vi.fn().mockResolvedValue({
              data: [],
            }),
          }),
          insert: vi.fn(() => ({
            select: () => ({
              single: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          })),
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
          delete: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
        };
      }

      if (table === "children") {
        return {
          select: () => ({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "child-1",
                  parent_id: "parent-1",
                  name: "Mia",
                  age: 8,
                  gender: "female",
                  points: 12,
                  streak_days: 3,
                  avatar: "🦊",
                  default_wechat_group_id: "group-1",
                },
              ],
            }),
          }),
          update: vi.fn(() => ({
            eq: updateChildEq,
          })),
        };
      }

      if (table === "homeworks") {
        return {
          select: () => ({
            in: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "hw-1",
                  child_id: "child-1",
                  title: "英语跟读",
                },
              ],
            }),
          }),
        };
      }

      if (table === "platform_accounts") {
        return {
          select: () => ({
            in: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "acct-1",
                  child_id: "child-1",
                  platform: "ixl",
                  external_account_ref: "mia-family-account",
                  status: "failed",
                  last_synced_at: null,
                  last_sync_error_summary: "Unexpected IXL page shape",
                },
              ],
            }),
          }),
        };
      }

      if (table === "message_routing_rules") {
        return {
          select: () => ({
            in: vi.fn(() => ({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: "rule-1",
                    child_id: "child-1",
                    homework_id: null,
                    channel: "wechat_group",
                    recipient_ref: "wechat-group-mia",
                    recipient_label: "Mia 家庭群",
                    created_at: "2026-04-20T10:00:00.000Z",
                  },
                ],
              }),
            })),
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
          delete: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
        };
      }

      if (table === "wechat_groups") {
        return {
          select: () => ({
            eq: vi.fn(() => {
              const groupsData = {
                data: wechatGroupsState.map((group) => ({ ...group })),
              };
              const result = Promise.resolve(groupsData);
              (result as any).order = vi.fn().mockResolvedValue(groupsData);
              return result;
            }),
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
          update: vi.fn((payload: { display_name: string | null }) => ({
            eq: vi.fn((field: string, id: string) => {
              const group = wechatGroupsState.find((item) => item.id === id);
              if (group) {
                group.display_name = payload.display_name;
              }
              return updateWeChatGroupEq(field, id);
            }),
          })),
          delete: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
        };
      }

      if (table === "voice_push_tasks") {
        return {
          select: () => ({
            in: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: "voice-task-1",
                      child_id: "child-1",
                      homework_id: "hw-1",
                      status: "retrying",
                      delivery_attempts: 2,
                      failure_reason: "Bridge offline",
                      last_attempted_at: "2026-04-20T10:00:00.000Z",
                      sent_at: null,
                      created_at: "2026-04-20T09:50:00.000Z",
                    },
                  ],
                }),
              })),
            })),
          }),
        };
      }

      if (table === "platform_sync_jobs") {
        return {
          select: () => ({
            in: vi.fn(() => ({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: "job-1",
                    platform_account_id: "acct-1",
                    status: "failed",
                    next_retry_at: "2026-04-21T11:00:00.000Z",
                    created_at: "2026-04-21T10:00:00.000Z",
                  },
                ],
              }),
            })),
          }),
        };
      }

      if (table === "learning_events") {
        return {
          select: () => ({
            in: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: "evt-1",
                      platform_account_id: "acct-1",
                      title: "IXL A.1 Add within 10",
                      occurred_at: "2026-04-21T10:10:00.000Z",
                    },
                  ],
                }),
              })),
            })),
          }),
        };
      }

      return {
        select: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      };
    }),
  };
}

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => createSupabaseClient(),
}));

vi.mock("next/navigation", async () => {
  const actual = await vi.importActual("next/navigation");
  return {
    ...actual,
    useRouter: () => ({
      push: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
    }),
    useSearchParams: () => searchParamsState,
  };
});

global.fetch = fetchMock as typeof fetch;

describe("Settings IA pages", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    updateChildEq.mockClear();
    updateWeChatGroupEq.mockClear();
    searchParamsState.forEach((_, key) => searchParamsState.delete(key));
    wechatGroupsState[0].display_name = "Mia 数学老师群";
    wechatGroupsState[1].display_name = "Mia 阅读老师群";
  });

  it("renders the root settings page as a navigation hub", async () => {
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("设置导航")).toBeInTheDocument();
    });

    expect(
      screen.getByRole("link", { name: /家庭通知通道/i })
    ).toHaveAttribute("href", "/settings/channels");
    expect(
      screen.getByRole("link", { name: /孩子集成/i })
    ).toHaveAttribute("href", "/settings/integrations");
    expect(
      screen.getByRole("link", { name: /系统运行/i })
    ).toHaveAttribute("href", "/settings/system");
  });

  it("keeps family-level channel settings on the channels page", async () => {
    render(<SettingsChannelsPage />);

    await waitFor(() => {
      expect(screen.getByText("微信群管理")).toBeInTheDocument();
      expect(screen.getByText("提醒与 Telegram 通道")).toBeInTheDocument();
    });

    expect(
      screen.getByText(/管理微信群、Telegram 等家庭级通知通道/)
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Telegram Chat ID")).toHaveValue("123456789");
    expect(screen.queryByLabelText("Telegram Bot Token")).not.toBeInTheDocument();
    expect(screen.getByText("Mia 数学老师群")).toBeInTheDocument();
    expect(screen.getByText("Mia 阅读老师群")).toBeInTheDocument();
  });

  it("checks bridge health from the channels page", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        status: "healthy",
        healthUrl: "http://127.0.0.1:4010/health",
        deliveredCount: 2,
      }),
    });

    render(<SettingsChannelsPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "检查发送服务状态" })
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "检查发送服务状态" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/voice-push/bridge-health", {
        method: "GET",
      });
      expect(
        screen.getByText(
          "发送服务可访问：http://127.0.0.1:4010/health，已发送 2 条任务。"
        )
      ).toBeInTheDocument();
    });
  });

  it("lets parents rename a discovered WeChat group from the channels page", async () => {
    render(<SettingsChannelsPage />);

    await waitFor(() => {
      expect(screen.getByText("Mia 数学老师群")).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole("button", { name: "编辑" })[0]);
    fireEvent.change(screen.getByPlaceholderText("群显示名称"), {
      target: { value: "Mia 数学打卡群" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(updateWeChatGroupEq).toHaveBeenCalledWith("id", "group-1");
      expect(screen.getByText("Mia 数学打卡群")).toBeInTheDocument();
    });
  });

  it("submits a child platform binding from the integrations page", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        account: { id: "acct-2" },
      }),
    });

    render(<SettingsIntegrationsPage />);

    await waitFor(() => {
      expect(screen.getByText("学习平台账号")).toBeInTheDocument();
      expect(screen.getByText("孩子默认提交群")).toBeInTheDocument();
    });

    fireEvent.change(screen.getAllByLabelText("孩子")[0], {
      target: { value: "child-1" },
    });
    fireEvent.change(screen.getByLabelText("用户名或账号标识"), {
      target: { value: "mia@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "手动 Session" }));
    fireEvent.click(screen.getByRole("button", { name: "绑定账号" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/platform-connections",
        expect.objectContaining({
          method: "POST",
        })
      );
    });

    expect(
      screen.getByText((content) => content.includes("Mia 家庭群 (wechat-group-mia)"))
    ).toBeInTheDocument();
  });

  it("supports Raz-Kids and Epic as manual-session binding options", async () => {
    render(<SettingsIntegrationsPage />);

    await waitFor(() => {
      expect(screen.getByText("学习平台账号")).toBeInTheDocument();
    });

    expect(screen.getByRole("option", { name: "Raz-Kids" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Epic" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("平台"), {
      target: { value: "raz-kids" },
    });

    expect(screen.getByText(/Raz-Kids 目前先接入手动 Session 绑定/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "自动登录（IXL / Khan）" })).toBeDisabled();
  });

  it("switches to manual session guidance when IXL auto login hits a captcha challenge", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({
        error: "IXL is requiring a CAPTCHA challenge. Automatic login is not possible at this time.",
        reason: "captcha_required",
        manualSessionUrl: "https://www.ixl.com/signin",
        manualSessionTemplate: {
          cookies: [
            { name: "PHPSESSID", value: "" },
            { name: "ixl_user", value: "" },
          ],
        },
      }),
    });

    render(<SettingsIntegrationsPage />);

    await waitFor(() => {
      expect(screen.getByText("学习平台账号")).toBeInTheDocument();
    });

    fireEvent.change(screen.getAllByLabelText("孩子")[0], {
      target: { value: "child-1" },
    });
    fireEvent.change(screen.getByLabelText("用户名或账号标识"), {
      target: { value: "mia@example.com" },
    });
    fireEvent.change(screen.getByLabelText("登录密码"), {
      target: { value: "secret123" },
    });

    fireEvent.click(screen.getByRole("button", { name: "测试登录并绑定" }));

    await waitFor(() => {
      expect(screen.getByText(/IXL 当前要求你先手动完成验证码/)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "打开 IXL 登录页" })).toHaveAttribute(
        "href",
        "https://www.ixl.com/signin"
      );
      expect(screen.getByLabelText("Managed Session JSON")).toBeInTheDocument();
      expect(screen.getByLabelText("Managed Session JSON")).toHaveValue(
        JSON.stringify(
          {
            cookies: [
              { name: "PHPSESSID", value: "" },
              { name: "ixl_user", value: "" },
            ],
          },
          null,
          2
        )
      );
    });
  });

  it("keeps child routing focused on wechat bridge targets", async () => {
    render(<SettingsIntegrationsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText("通道")).toBeInTheDocument();
    });

    expect(screen.getByRole("option", { name: "微信群" })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Telegram Chat" })
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("微信群标识")).toBeInTheDocument();
  });

  it("lets parents choose a child default WeChat group from the household group directory", async () => {
    render(<SettingsIntegrationsPage />);

    await waitFor(() => {
      expect(screen.getByText("孩子默认提交群")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Mia 默认微信群")).toHaveValue("group-1");
    });

    fireEvent.change(screen.getByLabelText("Mia 默认微信群"), {
      target: { value: "group-2" },
    });

    fireEvent.click(screen.getByRole("button", { name: "保存 Mia 默认群" }));

    await waitFor(() => {
      expect(updateChildEq).toHaveBeenCalledWith("id", "child-1");
    });
  });

  it("shows runtime status and supports retry actions on the system page", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ jobStatus: "claimed" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          processedCount: 1,
          sentCount: 0,
          retryingCount: 1,
          failedCount: 0,
          skippedCount: 0,
        }),
      });

    render(<SettingsSystemPage />);

    await waitFor(() => {
      expect(screen.getByText("平台同步状态")).toBeInTheDocument();
      expect(screen.getByText("语音桥接状态")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "立即重试" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/platform-sync/import",
        expect.objectContaining({ method: "POST" })
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "处理发送队列" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/voice-push/run",
        expect.objectContaining({ method: "GET" })
      );
      expect(screen.getByText(/最近一次处理结果/)).toBeInTheDocument();
    });
  });
});
