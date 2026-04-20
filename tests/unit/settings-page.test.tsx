import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SettingsPage from "@/app/(parent)/settings/page";

const fetchMock = vi.fn();

const supabaseClient = {
  auth: {
    getSession: vi.fn().mockResolvedValue({
      data: {
        session: {
          user: { id: "parent-1" },
        },
      },
    }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  },
  from: vi.fn((table: string) => {
    if (table === "children") {
      return {
        select: () => ({
          eq: vi.fn().mockResolvedValue({
            data: [
              {
                id: "child-1",
                parent_id: "parent-1",
                name: "Mia",
              },
            ],
          }),
        }),
      };
    }

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
                telegram_chat_id: null,
                telegram_recipient_label: null,
                created_at: "2026-04-01T00:00:00.000Z",
              },
            }),
          }),
        }),
      };
    }

    if (table === "custom_homework_types") {
      return {
        select: () => ({
          eq: vi.fn().mockResolvedValue({
            data: [],
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
                external_account_ref: "family",
                status: "failed",
                last_synced_at: null,
                last_sync_error_summary: "Unexpected IXL page shape",
              },
            ],
          }),
        }),
      };
    }

    if (table === "platform_sync_jobs") {
      return {
        select: () => ({
          in: vi.fn(() => ({
            order: vi.fn().mockResolvedValue({
              data: [],
            }),
          })),
        }),
      };
    }

    return {
      update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
      insert: vi.fn(() => ({
        select: () => ({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      })),
      delete: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
    };
  }),
};

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => supabaseClient,
}));

global.fetch = fetchMock as any;

describe("SettingsPage", () => {
  it("renders platform sync status before reminder settings", async () => {
    fetchMock.mockReset();
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("平台同步状态")).toBeInTheDocument();
      expect(screen.getByText("提醒设置")).toBeInTheDocument();
    });

    const syncHeading = screen.getByText("平台同步状态");
    const reminderHeading = screen.getByText("提醒设置");

    expect(
      syncHeading.compareDocumentPosition(reminderHeading)
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("retries a failed platform account from the settings page", async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ jobStatus: "claimed" }),
    });

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "立即重试" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "立即重试" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/platform-sync/import",
        expect.objectContaining({
          method: "POST",
        })
      );
    });
  });
});
