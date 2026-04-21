import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlatformSyncStatusPanel } from "@/components/parent/PlatformSyncStatusPanel";

describe("PlatformSyncStatusPanel", () => {
  it("renders active, failed, and attention-required platform account states", () => {
    render(
      <PlatformSyncStatusPanel
        accounts={[
          {
            id: "acct-1",
            childName: "Mia",
            platform: "ixl",
            externalAccountRef: "family",
            status: "active",
            lastSyncedAt: "2026-04-20T10:00:00.000Z",
            lastSyncErrorSummary: null,
            nextRetryAt: null,
            recentActivities: [
              {
                id: "evt-1",
                title: "IXL A.1 Add within 10",
                occurredAt: "2026-04-20T10:00:00.000Z",
              },
            ],
          },
          {
            id: "acct-2",
            childName: "Leo",
            platform: "ixl",
            externalAccountRef: "school",
            status: "failed",
            lastSyncedAt: null,
            lastSyncErrorSummary: "Unexpected IXL page shape",
            nextRetryAt: "2026-04-20T10:15:00.000Z",
            recentActivities: [],
          },
          {
            id: "acct-3",
            childName: "Ava",
            platform: "khan-academy",
            externalAccountRef: "classroom",
            status: "attention_required",
            lastSyncedAt: null,
            lastSyncErrorSummary: "Managed Khan session expired",
            nextRetryAt: null,
            recentActivities: [
              {
                id: "evt-2",
                title: "Khan Academy Fractions basics",
                occurredAt: "2026-04-20T11:00:00.000Z",
              },
            ],
          },
        ]}
      />
    );

    expect(screen.getByText("平台同步状态")).toBeInTheDocument();
    expect(screen.getByText("Mia")).toBeInTheDocument();
    expect(screen.getByText("Leo")).toBeInTheDocument();
    expect(screen.getByText("Ava")).toBeInTheDocument();
    expect(screen.getByText("运行正常")).toBeInTheDocument();
    expect(screen.getByText("等待重试")).toBeInTheDocument();
    expect(screen.getByText("需要处理")).toBeInTheDocument();
    expect(screen.getByText("Unexpected IXL page shape")).toBeInTheDocument();
    expect(screen.getByText("Managed Khan session expired")).toBeInTheDocument();
    expect(screen.getByText(/下次重试/)).toBeInTheDocument();
    expect(screen.getByText(/最近同步/)).toBeInTheDocument();
    expect(screen.getByText("最近内容")).toBeInTheDocument();
    expect(screen.getByText("IXL A.1 Add within 10")).toBeInTheDocument();
    expect(screen.getByText("Khan Academy Fractions basics")).toBeInTheDocument();
  });

  it("shows an empty state when no platform accounts are bound", () => {
    render(<PlatformSyncStatusPanel accounts={[]} />);

    expect(
      screen.getByText("还没有绑定任何学习平台账号。")
    ).toBeInTheDocument();
  });

  it("offers a retry action for failed and attention-required accounts", async () => {
    const onRetry = vi.fn().mockResolvedValue(undefined);

    render(
      <PlatformSyncStatusPanel
        accounts={[
          {
            id: "acct-2",
            childName: "Leo",
            platform: "ixl",
            externalAccountRef: "school",
            status: "failed",
            lastSyncedAt: null,
            lastSyncErrorSummary: "Unexpected IXL page shape",
            nextRetryAt: "2026-04-20T10:15:00.000Z",
            recentActivities: [],
          },
          {
            id: "acct-3",
            childName: "Ava",
            platform: "ixl",
            externalAccountRef: "classroom",
            status: "attention_required",
            lastSyncedAt: null,
            lastSyncErrorSummary: "Managed IXL session expired",
            nextRetryAt: null,
            recentActivities: [],
          },
        ]}
        onRetry={onRetry}
      />
    );

    fireEvent.click(screen.getAllByRole("button", { name: "立即重试" })[0]);

    await waitFor(() => {
      expect(onRetry).toHaveBeenCalledWith("acct-2");
    });
  });
});
