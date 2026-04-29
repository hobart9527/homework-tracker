import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VoicePushStatusPanel } from "@/components/parent/VoicePushStatusPanel";

describe("VoicePushStatusPanel", () => {
  it("renders pending, retrying, sent, and failed voice push task states", () => {
    render(
      <VoicePushStatusPanel
        tasks={[
          {
            id: "task-1",
            childName: "Mia",
            homeworkTitle: "英语跟读",
            status: "pending",
            deliveryAttempts: 0,
            failureReason: null,
            lastAttemptedAt: null,
            sentAt: null,
          },
          {
            id: "task-2",
            childName: "Leo",
            homeworkTitle: "语文朗读",
            status: "retrying",
            deliveryAttempts: 2,
            failureReason: "Bridge offline",
            lastAttemptedAt: "2026-04-20T10:15:00.000Z",
            sentAt: null,
          },
          {
            id: "task-3",
            childName: "Ava",
            homeworkTitle: "数学录音",
            status: "sent",
            deliveryAttempts: 1,
            failureReason: null,
            lastAttemptedAt: "2026-04-20T10:05:00.000Z",
            sentAt: "2026-04-20T10:06:00.000Z",
          },
          {
            id: "task-4",
            childName: "Noah",
            homeworkTitle: "科学背诵",
            status: "failed",
            deliveryAttempts: 3,
            failureReason: "Unsupported media type",
            lastAttemptedAt: "2026-04-20T10:25:00.000Z",
            sentAt: null,
          },
        ]}
      />
    );

    expect(screen.getByText("语音桥接状态")).toBeInTheDocument();
    expect(screen.getByText("待发送")).toBeInTheDocument();
    expect(screen.getByText("重试中")).toBeInTheDocument();
    expect(screen.getByText("已发送")).toBeInTheDocument();
    expect(screen.getByText("发送失败")).toBeInTheDocument();
    expect(screen.getByText("Bridge offline")).toBeInTheDocument();
    expect(screen.getByText("Unsupported media type")).toBeInTheDocument();
    expect(screen.getAllByText(/已尝试发送/)).toHaveLength(4);
  });

  it("shows an empty state when no voice push tasks exist", () => {
    render(<VoicePushStatusPanel tasks={[]} />);

    expect(
      screen.getByText("还没有需要桥接发送的录音作业。")
    ).toBeInTheDocument();
  });

  it("runs the queue from the panel", async () => {
    const onRunQueue = vi.fn().mockResolvedValue(undefined);

    render(
      <VoicePushStatusPanel
        tasks={[
          {
            id: "task-1",
            childName: "Mia",
            homeworkTitle: "英语跟读",
            status: "pending",
            deliveryAttempts: 0,
            failureReason: null,
            lastAttemptedAt: null,
            sentAt: null,
          },
        ]}
        onRunQueue={onRunQueue}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "处理发送队列" }));

    await waitFor(() => {
      expect(onRunQueue).toHaveBeenCalled();
    });
  });

  it("shows the latest queue run summary when provided", () => {
    render(
      <VoicePushStatusPanel
        tasks={[
          {
            id: "task-1",
            childName: "Mia",
            homeworkTitle: "英语跟读",
            status: "pending",
            deliveryAttempts: 0,
            failureReason: null,
            lastAttemptedAt: null,
            sentAt: null,
          },
        ]}
        lastRunSummary={{
          processedCount: 3,
          sentCount: 1,
          retryingCount: 1,
          failedCount: 1,
          skippedCount: 0,
        }}
      />
    );

    expect(screen.getByText("最近一次处理结果")).toBeInTheDocument();
    expect(
      screen.getByText(/已处理 3 条，发送成功 1 条，等待重试 1 条，发送失败 1 条，跳过 0 条。/)
    ).toBeInTheDocument();
  });
});
