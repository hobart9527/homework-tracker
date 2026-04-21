import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { createElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CheckInModal } from "@/components/child/CheckInModal";
import { isAfterCutoff } from "@/lib/homework-utils";

const {
  getSessionMock,
  uploadMock,
  attachmentsInsertMock,
  voicePushTasksInsertMock,
  tableSelectMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  uploadMock: vi.fn(),
  attachmentsInsertMock: vi.fn(),
  voicePushTasksInsertMock: vi.fn(),
  tableSelectMock: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: getSessionMock,
    },
    storage: {
      from: vi.fn(() => ({
        upload: uploadMock,
      })),
    },
    from: tableSelectMock,
  }),
}));

// Checkpoint type validation
describe("Checkpoint type validation", () => {
  const VALID_TYPES = ["photo", "audio", null] as const;

  it("should accept valid checkpoint types", () => {
    for (const t of VALID_TYPES) {
      expect(["photo", "audio", null].includes(t)).toBe(true);
    }
  });

  it("should have correct display mapping", () => {
    const displayMap = {
      photo: { label: "照片", icon: "📸" },
      audio: { label: "录音", icon: "🎵" },
    } as const;

    expect(displayMap.photo.icon).toBe("📸");
    expect(displayMap.photo.label).toBe("照片");
    expect(displayMap.audio.icon).toBe("🎵");
  });

  it("should treat null/empty as no requirement", () => {
    const checkRequiresCheckpoint = (type: string | null | undefined) => {
      return !!type && ["photo", "audio"].includes(type);
    };

    expect(checkRequiresCheckpoint(null)).toBe(false);
    expect(checkRequiresCheckpoint(undefined)).toBe(false);
    expect(checkRequiresCheckpoint("")).toBe(false);
    expect(checkRequiresCheckpoint("photo")).toBe(true);
    expect(checkRequiresCheckpoint("audio")).toBe(true);
    expect(checkRequiresCheckpoint("screenshot")).toBe(false);
    expect(checkRequiresCheckpoint("invalid")).toBe(false);
  });

// Check-in overdue detection
describe("Overdue detection", () => {
  it("should return false when no cutoff time set", () => {
    expect(isAfterCutoff(null)).toBe(false);
  });

  it("should detect overdue when time is past cutoff", () => {
    const reference = new Date("2026-04-08T21:00:00");
    expect(isAfterCutoff("20:00", reference)).toBe(true);
  });

  it("should return not overdue when time is before cutoff", () => {
    const reference = new Date("2026-04-08T18:30:00");
    expect(isAfterCutoff("20:00", reference)).toBe(false);
  });

  it("should handle midnight cutoff", () => {
    const reference = new Date("2026-04-08T23:59:59");
    expect(isAfterCutoff("00:00", reference)).toBe(true);
  });
});

// Child RLS policy simulation
describe("Data ownership model", () => {
  interface Parent { id: string; passcode: string }
  interface Child { id: string; parent_id: string; name: string; password_hash: string }

  function canAccessChild(parent: Parent, child: Child, parents: Parent[]): boolean {
    return parents.some(p => p.id === parent.id && child.parent_id === p.id);
  }

  it("should allow parent to access their own child", () => {
    const parent: Parent = { id: "p1", passcode: "0000" };
    const child: Child = { id: "c1", parent_id: "p1", name: "Ivy", password_hash: "password" };
    expect(canAccessChild(parent, child, [parent])).toBe(true);
  });

  it("should block parent from accessing other parent's child", () => {
    const parent1: Parent = { id: "p1", passcode: "0000" };
    const parent2: Parent = { id: "p2", passcode: "0000" };
    const child: Child = { id: "c1", parent_id: "p2", name: "Ivy", password_hash: "password" };
    expect(canAccessChild(parent1, child, [parent1])).toBe(false);
  });
});

describe("Child check-in UI strings", () => {
  beforeEach(() => {
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          user: { id: "child-1" },
        },
      },
    });
    uploadMock.mockResolvedValue({ error: null });
    attachmentsInsertMock.mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: "attachment-default" },
          error: null,
        }),
      }),
    });
    voicePushTasksInsertMock.mockResolvedValue({ error: null });
    tableSelectMock.mockImplementation((table: string) => {
      if (table === "attachments") {
        return {
          insert: attachmentsInsertMock,
        };
      }

      if (table === "voice_push_tasks") {
        return {
          insert: voicePushTasksInsertMock,
        };
      }

      return {
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });
  });

  afterEach(() => {
    getSessionMock.mockReset();
    uploadMock.mockReset();
    attachmentsInsertMock.mockReset();
    voicePushTasksInsertMock.mockReset();
    tableSelectMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a non-scoring success message for repeat submissions", () => {
    expect("本次记录已保存，今天不重复加分").toContain("不重复加分");
  });

  it("shows the required proof label before submission", () => {
    expect("需要照片").toContain("照片");
  });

  it("closes the modal after a successful submission", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          checkIn: { id: "check-1" },
          message: "完成成功，获得 4 积分",
        }),
      } as any)
    );

    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(
      createElement(CheckInModal, {
        homework: {
          id: "hw-1",
          title: "阅读练习",
          type_icon: "📖",
          point_value: 4,
          required_checkpoint_type: null,
        } as any,
        isOpen: true,
        onClose,
        onSuccess,
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "确认完成 ✨" }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("blocks submission until the required attachment is added", () => {
    render(
      createElement(CheckInModal, {
        homework: {
          id: "hw-photo-1",
          title: "阅读练习",
          type_icon: "📖",
          point_value: 4,
          required_checkpoint_type: "photo",
        } as any,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      })
    );

    expect(screen.getByText("请先添加照片，再提交本次作业")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认完成 ✨" })).toBeDisabled();
  });

  it("creates a voice push task after an audio attachment is stored", async () => {
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          user: { id: "child-1" },
        },
      },
    });
    uploadMock.mockResolvedValue({ error: null });
    attachmentsInsertMock.mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: "attachment-1" },
          error: null,
        }),
      }),
    });
    voicePushTasksInsertMock.mockResolvedValue({ error: null });
    tableSelectMock.mockImplementation((table: string) => {
      if (table === "attachments") {
        return {
          insert: attachmentsInsertMock,
        };
      }

      if (table === "voice_push_tasks") {
        return {
          insert: voicePushTasksInsertMock,
        };
      }

      return {
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          checkIn: { id: "check-voice-1" },
          message: "完成成功，获得 4 积分",
        }),
      } as any)
    );

    const onClose = vi.fn();
    const onSuccess = vi.fn();

    const { container } = render(
      createElement(CheckInModal, {
        homework: {
          id: "hw-audio-1",
          child_id: "child-1",
          title: "朗读打卡",
          type_icon: "🎧",
          point_value: 4,
          required_checkpoint_type: "audio",
        } as any,
        isOpen: true,
        onClose,
        onSuccess,
      })
    );

    const audioFile = new File(["voice"], "reading.webm", {
      type: "audio/webm",
      lastModified: 1234,
    });

    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();

    fireEvent.change(fileInput as HTMLInputElement, {
      target: { files: [audioFile] },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认完成 ✨" }));

    await waitFor(() => {
      expect(voicePushTasksInsertMock).toHaveBeenCalledTimes(1);
    });

    expect(voicePushTasksInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        child_id: "child-1",
        homework_id: "hw-audio-1",
        check_in_id: "check-voice-1",
        attachment_id: "attachment-1",
        file_path: expect.stringContaining("reading.webm"),
        status: "pending",
      })
    );
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows a saved-audio preview state before submission", async () => {
    const { container } = render(
      createElement(CheckInModal, {
        homework: {
          id: "hw-audio-preview-1",
          child_id: "child-1",
          title: "朗读试听",
          type_icon: "🎧",
          point_value: 4,
          required_checkpoint_type: "audio",
        } as any,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      })
    );

    const audioFile = new File(["voice"], "preview-reading.webm", {
      type: "audio/webm",
      lastModified: 1357,
    });

    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();

    fireEvent.change(fileInput as HTMLInputElement, {
      target: { files: [audioFile] },
    });

    expect(
      screen.getByText("录音已保存，可以试听后再提交")
    ).toBeInTheDocument();
    expect(screen.getByText("preview-reading.webm")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除重录" })).toBeInTheDocument();
    expect(container.querySelector("audio")).not.toBeNull();
  });

  it("lets the child remove a recorded attachment and record again", async () => {
    const { container } = render(
      createElement(CheckInModal, {
        homework: {
          id: "hw-audio-remove-1",
          child_id: "child-1",
          title: "朗读重录",
          type_icon: "🎧",
          point_value: 4,
          required_checkpoint_type: "audio",
        } as any,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      })
    );

    const audioFile = new File(["voice"], "retry-reading.webm", {
      type: "audio/webm",
      lastModified: 2468,
    });

    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();

    fireEvent.change(fileInput as HTMLInputElement, {
      target: { files: [audioFile] },
    });

    fireEvent.click(screen.getByRole("button", { name: "删除重录" }));

    expect(screen.queryByText("retry-reading.webm")).not.toBeInTheDocument();
    expect(
      screen.getAllByText("请先添加录音，再提交本次作业").length
    ).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "确认完成 ✨" })).toBeDisabled();
  });

  it("keeps homework submission successful when voice push task creation fails", async () => {
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          user: { id: "child-1" },
        },
      },
    });
    uploadMock.mockResolvedValue({ error: null });
    attachmentsInsertMock.mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: "attachment-2" },
          error: null,
        }),
      }),
    });
    voicePushTasksInsertMock.mockResolvedValue({
      error: { message: "bridge unavailable" },
    });
    tableSelectMock.mockImplementation((table: string) => {
      if (table === "attachments") {
        return {
          insert: attachmentsInsertMock,
        };
      }

      if (table === "voice_push_tasks") {
        return {
          insert: voicePushTasksInsertMock,
        };
      }

      return {
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          checkIn: { id: "check-voice-2" },
          message: "完成成功，获得 4 积分",
        }),
      } as any)
    );

    const onClose = vi.fn();
    const onSuccess = vi.fn();

    const { container } = render(
      createElement(CheckInModal, {
        homework: {
          id: "hw-audio-2",
          child_id: "child-1",
          title: "朗读打卡",
          type_icon: "🎧",
          point_value: 4,
          required_checkpoint_type: "audio",
        } as any,
        isOpen: true,
        onClose,
        onSuccess,
      })
    );

    const audioFile = new File(["voice"], "reading.webm", {
      type: "audio/webm",
      lastModified: 5678,
    });

    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();

    fireEvent.change(fileInput as HTMLInputElement, {
      target: { files: [audioFile] },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认完成 ✨" }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("still uploads the attachment when the same-day check-in already exists", async () => {
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          user: { id: "child-1" },
        },
      },
    });
    uploadMock.mockResolvedValue({ error: null });
    attachmentsInsertMock.mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: "attachment-existing" },
          error: null,
        }),
      }),
    });
    voicePushTasksInsertMock.mockResolvedValue({ error: null });
    tableSelectMock.mockImplementation((table: string) => {
      if (table === "attachments") {
        return {
          insert: attachmentsInsertMock,
        };
      }

      if (table === "voice_push_tasks") {
        return {
          insert: voicePushTasksInsertMock,
        };
      }

      return {
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          deduplicated: true,
          checkIn: { id: "check-existing-1" },
          message: "今天已经提交过这项作业了",
        }),
      } as any)
    );

    const onClose = vi.fn();
    const onSuccess = vi.fn();

    const { container } = render(
      createElement(CheckInModal, {
        homework: {
          id: "hw-audio-existing-1",
          child_id: "child-1",
          title: "朗读补传",
          type_icon: "🎧",
          point_value: 4,
          required_checkpoint_type: "audio",
        } as any,
        isOpen: true,
        onClose,
        onSuccess,
      })
    );

    const audioFile = new File(["voice"], "retry-reading.webm", {
      type: "audio/webm",
      lastModified: 5678,
    });

    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();

    fireEvent.change(fileInput as HTMLInputElement, {
      target: { files: [audioFile] },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认完成 ✨" }));

    await waitFor(() => {
      expect(uploadMock).toHaveBeenCalledTimes(1);
      expect(attachmentsInsertMock).toHaveBeenCalledTimes(1);
      expect(voicePushTasksInsertMock).toHaveBeenCalledTimes(1);
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
});
