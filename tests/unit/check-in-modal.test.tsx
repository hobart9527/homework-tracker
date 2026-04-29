import { createElement } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CheckInModal } from "@/components/child/CheckInModal";
import { createVoicePushTask } from "@/lib/voice-push-tasks";

const getSession = vi.fn().mockResolvedValue({
  data: {
    session: {
      user: { id: "child-1" },
    },
  },
});
const upload = vi.fn().mockResolvedValue({ error: null });
const insertAttachmentSingle = vi.fn().mockResolvedValue({
  data: {
    id: "attachment-1",
  },
  error: null,
});
const insertAttachment = vi.fn(() => ({
  select: () => ({
    single: insertAttachmentSingle,
  }),
}));

const supabaseClient = {
  auth: {
    getSession,
  },
  storage: {
    from: vi.fn(() => ({
      upload,
    })),
  },
  from: vi.fn((table: string) => {
    if (table === "attachments") {
      return {
        insert: insertAttachment,
      };
    }

    return {
      insert: vi.fn(),
    };
  }),
};

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => supabaseClient,
}));

vi.mock("@/lib/voice-push-tasks", () => ({
  createVoicePushTask: vi.fn().mockResolvedValue(undefined),
}));

describe("CheckInModal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-23T10:00:00.000Z"));
    vi.clearAllMocks();

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        checkIn: {
          id: "check-in-1",
        },
      }),
    }) as any;

    class MockMediaRecorder {
      static instances: MockMediaRecorder[] = [];
      static isTypeSupported = vi.fn((mimeType: string) => mimeType === "audio/webm");

      stream: MediaStream;
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      mimeType: string;
      options?: MediaRecorderOptions;

      constructor(stream: MediaStream, options?: MediaRecorderOptions) {
        this.stream = stream;
        this.options = options;
        this.mimeType = options?.mimeType ?? "";
        MockMediaRecorder.instances.push(this);
      }

      start() {}

      stop() {
        this.ondataavailable?.({
          data: new Blob(["audio"], { type: "audio/webm" }),
        });
        this.onstop?.();
      }
    }

    Object.defineProperty(globalThis, "MediaRecorder", {
      configurable: true,
      writable: true,
      value: MockMediaRecorder,
    });

    Object.defineProperty(globalThis.navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [
            {
              stop: vi.fn(),
            },
          ],
        }),
      },
    });

    Object.defineProperty(globalThis.URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(() => "blob:recording-preview"),
    });

    Object.defineProperty(globalThis.URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
  });

  it("shows upload and record options, a running timer, and an audio preview after recording", async () => {
    render(
      createElement(CheckInModal, {
        homework: {
          id: "hw-audio",
          child_id: "child-1",
          type_id: null,
          type_name: "朗读",
          type_icon: "🎙️",
          title: "朗读录音",
          description: null,
          repeat_type: "daily",
          repeat_days: null,
          repeat_interval: null,
          repeat_start_date: null,
          repeat_end_date: null,
          point_value: 3,
          point_deduction: 0,
          estimated_minutes: null,
          daily_cutoff_time: "20:00",
          is_active: true,
          required_checkpoint_type: "audio",
          created_by: "parent-1",
          created_at: "2026-04-23T00:00:00.000Z",
          platform_binding_platform: null,
          platform_binding_source_ref: null,
          send_to_wechat: false,
          wechat_group_id: null,
        },
        targetDate: "2026-04-24",
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      })
    );

    expect(screen.getByRole("button", { name: "上传录音" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始录音" })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "开始录音" }));
    });

    expect(screen.getByText("录音中 00:00")).toBeInTheDocument();
    const [recorder] = (MediaRecorder as any).instances;
    expect(recorder.options).toEqual(
      expect.objectContaining({
        audioBitsPerSecond: 64000,
      })
    );

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByText("录音中 00:02")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "停止录音" }));
    });

    expect(screen.getByText("已添加录音")).toBeInTheDocument();

    expect(screen.getByText(/录音时长 00:02/)).toBeInTheDocument();
    expect(document.querySelector("audio")).not.toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "确认完成 ✨" }));
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/check-ins/create",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"targetDate\":\"2026-04-24\""),
      })
    );
  });

  it("prevents submission while recording is still in progress", async () => {
    render(
      createElement(CheckInModal, {
        homework: {
          id: "hw-audio",
          child_id: "child-1",
          type_id: null,
          type_name: "钢琴",
          type_icon: "🎹",
          title: "钢琴录音",
          description: null,
          repeat_type: "daily",
          repeat_days: null,
          repeat_interval: null,
          repeat_start_date: null,
          repeat_end_date: null,
          point_value: 3,
          point_deduction: 0,
          estimated_minutes: null,
          daily_cutoff_time: "20:00",
          is_active: true,
          required_checkpoint_type: null,
          created_by: "parent-1",
          created_at: "2026-04-23T00:00:00.000Z",
          platform_binding_platform: null,
          platform_binding_source_ref: null,
          send_to_wechat: false,
          wechat_group_id: null,
        },
        targetDate: "2026-04-24",
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      })
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "开始录音" }));
      await Promise.resolve();
    });

    expect(screen.getByRole("button", { name: "确认完成 ✨" })).toBeDisabled();
    expect(screen.getByText(/请先停止录音/)).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("keeps only one audio attachment when the child records more than once", async () => {
    render(
      createElement(CheckInModal, {
        homework: {
          id: "hw-audio",
          child_id: "child-1",
          type_id: null,
          type_name: "钢琴",
          type_icon: "🎹",
          title: "钢琴录音",
          description: null,
          repeat_type: "daily",
          repeat_days: null,
          repeat_interval: null,
          repeat_start_date: null,
          repeat_end_date: null,
          point_value: 3,
          point_deduction: 0,
          estimated_minutes: null,
          daily_cutoff_time: "20:00",
          is_active: true,
          required_checkpoint_type: null,
          created_by: "parent-1",
          created_at: "2026-04-23T00:00:00.000Z",
          platform_binding_platform: null,
          platform_binding_source_ref: null,
          send_to_wechat: false,
          wechat_group_id: null,
        },
        targetDate: "2026-04-24",
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      })
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "开始录音" }));
    });
    await act(async () => {
      vi.advanceTimersByTime(1000);
      fireEvent.click(screen.getByRole("button", { name: "停止录音" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "开始录音" }));
    });
    await act(async () => {
      vi.advanceTimersByTime(2000);
      fireEvent.click(screen.getByRole("button", { name: "停止录音" }));
    });

    expect(screen.getAllByText("已添加录音")).toHaveLength(1);
    expect(document.querySelectorAll("audio")).toHaveLength(1);
    expect(screen.getByText(/录音时长 00:02/)).toBeInTheDocument();
  });

  it("surfaces the storage error message when audio upload fails", async () => {
    upload.mockResolvedValueOnce({
      error: { message: "mime type not allowed" },
    });
    const onAttachmentUploadStatusChange = vi.fn();

    render(
      createElement(CheckInModal, {
        homework: {
          id: "hw-audio",
          child_id: "child-1",
          type_id: null,
          type_name: "钢琴",
          type_icon: "🎹",
          title: "钢琴录音",
          description: null,
          repeat_type: "daily",
          repeat_days: null,
          repeat_interval: null,
          repeat_start_date: null,
          repeat_end_date: null,
          point_value: 3,
          point_deduction: 0,
          estimated_minutes: null,
          daily_cutoff_time: "20:00",
          is_active: true,
          required_checkpoint_type: "audio",
          created_by: "parent-1",
          created_at: "2026-04-23T00:00:00.000Z",
          platform_binding_platform: null,
          platform_binding_source_ref: null,
          send_to_wechat: false,
          wechat_group_id: null,
        },
        targetDate: "2026-04-24",
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        onAttachmentUploadStatusChange,
      })
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "开始录音" }));
    });

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "停止录音" }));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "确认完成 ✨" }));
    });

    expect(onAttachmentUploadStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({
        state: "failed",
        message: "录音上传失败：mime type not allowed",
      })
    );
  });

  it("keeps the modal open and shows upload progress until the audio is stored", async () => {
    let resolveUpload: ((value: { error: null }) => void) | null = null;
    upload.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveUpload = resolve;
        })
    );
    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(
      createElement(CheckInModal, {
        homework: {
          id: "hw-audio",
          child_id: "child-1",
          type_id: null,
          type_name: "钢琴",
          type_icon: "🎹",
          title: "钢琴录音",
          description: null,
          repeat_type: "daily",
          repeat_days: null,
          repeat_interval: null,
          repeat_start_date: null,
          repeat_end_date: null,
          point_value: 3,
          point_deduction: 0,
          estimated_minutes: null,
          daily_cutoff_time: "20:00",
          is_active: true,
          required_checkpoint_type: "audio",
          created_by: "parent-1",
          created_at: "2026-04-23T00:00:00.000Z",
          platform_binding_platform: null,
          platform_binding_source_ref: null,
          send_to_wechat: false,
          wechat_group_id: null,
        },
        targetDate: "2026-04-24",
        isOpen: true,
        onClose,
        onSuccess,
      })
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "开始录音" }));
    });
    await act(async () => {
      vi.advanceTimersByTime(1000);
      fireEvent.click(screen.getByRole("button", { name: "停止录音" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "确认完成 ✨" }));
    });

    expect(screen.getByText("录音上传中")).toBeInTheDocument();
    expect(screen.getByText("20%")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();

    await act(async () => {
      resolveUpload?.({ error: null });
      await Promise.resolve();
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not wait for the voice push task to finish before closing after a successful audio submission", async () => {
    let resolveVoicePush: (() => void) | null = null;
    vi.mocked(createVoicePushTask).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveVoicePush = () => resolve(undefined as never);
        })
    );

    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(
      createElement(CheckInModal, {
        homework: {
          id: "hw-audio",
          child_id: "child-1",
          type_id: null,
          type_name: "钢琴",
          type_icon: "🎹",
          title: "钢琴录音",
          description: null,
          repeat_type: "daily",
          repeat_days: null,
          repeat_interval: null,
          repeat_start_date: null,
          repeat_end_date: null,
          point_value: 3,
          point_deduction: 0,
          estimated_minutes: null,
          daily_cutoff_time: "20:00",
          is_active: true,
          required_checkpoint_type: "audio",
          created_by: "parent-1",
          created_at: "2026-04-23T00:00:00.000Z",
          platform_binding_platform: null,
          platform_binding_source_ref: null,
          send_to_wechat: false,
          wechat_group_id: null,
        },
        targetDate: "2026-04-24",
        isOpen: true,
        onClose,
        onSuccess,
      })
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "开始录音" }));
      await Promise.resolve();
    });

    expect(screen.getByRole("button", { name: "停止录音" })).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1000);
      fireEvent.click(screen.getByRole("button", { name: "停止录音" }));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "确认完成 ✨" }));
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveVoicePush?.();
    });
  });
});
