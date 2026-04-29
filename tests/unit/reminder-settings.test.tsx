import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReminderSettings } from "@/components/parent/ReminderSettings";

const updateMock = vi.hoisted(() => vi.fn());
const getSessionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: getSessionMock,
    },
    from: vi.fn(() => ({
      update: updateMock,
    })),
  }),
}));

describe("ReminderSettings", () => {
  beforeEach(() => {
    updateMock.mockReset();
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          user: { id: "parent-1" },
        },
      },
    });
    updateMock.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
  });

  it("saves Telegram recipient fields alongside reminder settings", async () => {
    const onUpdate = vi.fn();

    render(
      <ReminderSettings
        settings={
          {
            id: "parent-1",
            passcode: "0000",
            reminder_cutoff_time: "20:00",
            auto_remind_parent: true,
            auto_remind_child: false,
            quiet_hours_start: null,
            quiet_hours_end: null,
            telegram_chat_id: "",
            telegram_recipient_label: "",
            created_at: "2026-04-01T00:00:00.000Z",
          } as any
        }
        onUpdate={onUpdate}
      />
    );

    fireEvent.change(screen.getByPlaceholderText("例如 123456789"), {
      target: { value: "123456789" },
    });
    fireEvent.change(screen.getByPlaceholderText("例如 家长通知"), {
      target: { value: "家长通知" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          telegram_chat_id: "123456789",
          telegram_recipient_label: "家长通知",
        })
      );
    });

    expect(onUpdate).toHaveBeenCalledTimes(1);
  });
});
