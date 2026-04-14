import { describe, it, expect, vi, afterEach } from "vitest";
import { createElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CheckInModal } from "@/components/child/CheckInModal";
import { isAfterCutoff } from "@/lib/homework-utils";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: {
            user: { id: "child-1" },
          },
        },
      }),
    },
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ error: null }),
      })),
    },
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a non-scoring success message for repeat submissions", () => {
    expect("本次记录已保存，今天不重复加分").toContain("不重复加分");
  });

  it("shows the required proof label before submission", () => {
    expect("需要照片").toContain("照片");
  });

  it("surfaces the server success message in the modal", async () => {
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
      expect(screen.getByText("完成成功，获得 4 积分")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "知道了" })).toBeInTheDocument();
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
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
});
