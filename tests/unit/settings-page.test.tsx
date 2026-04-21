import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "@/app/(parent)/settings/page";
import SettingsChannelsPage from "@/app/(parent)/settings/channels/page";
import SettingsIntegrationsPage from "@/app/(parent)/settings/integrations/page";
import SettingsSystemPage from "@/app/(parent)/settings/system/page";

const fetchMock = vi.fn();
const searchParamsState = new URLSearchParams();

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
                },
              ],
            }),
          }),
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
    searchParamsState.forEach((_, key) => searchParamsState.delete(key));
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
      expect(screen.getByText("微信 Bridge 说明")).toBeInTheDocument();
      expect(screen.getByText("提醒与 Telegram 通道")).toBeInTheDocument();
    });

    expect(
      screen.getByText(/这里是家长角色管理通道能力和接收方式的统一入口/)
    ).toBeInTheDocument();
    expect(screen.getByText(/本地测试步骤/)).toBeInTheDocument();
    expect(
      screen.getByText(/VOICE_PUSH_BRIDGE_URL=http:\/\/127\.0\.0\.1:4010\/send/)
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Telegram Chat ID")).toHaveValue("123456789");
    expect(screen.queryByLabelText("Telegram Bot Token")).not.toBeInTheDocument();
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
        screen.getByRole("button", { name: "一键自检微信 Bridge" })
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "一键自检微信 Bridge" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/voice-push/bridge-health", {
        method: "GET",
      });
      expect(
        screen.getByText(
          "Bridge 可访问：http://127.0.0.1:4010/health，当前已接收 2 条任务。"
        )
      ).toBeInTheDocument();
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
      expect(screen.getByText("孩子默认消息路由")).toBeInTheDocument();
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
