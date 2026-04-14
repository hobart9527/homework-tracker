import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SettingsPage from "@/app/(parent)/settings/page";

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

describe("SettingsPage", () => {
  it("renders quick type management before reminder settings", async () => {
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("作业类型")).toBeInTheDocument();
      expect(screen.getByText("提醒设置")).toBeInTheDocument();
    });

    const quickTypeHeading = screen.getByText("作业类型");
    const reminderHeading = screen.getByText("提醒设置");

    expect(
      quickTypeHeading.compareDocumentPosition(reminderHeading)
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});
