import { describe, it, expect } from "vitest";

// Checkpoint type validation
describe("Checkpoint type validation", () => {
  const VALID_TYPES = ["photo", "screenshot", "audio", null] as const;

  it("should accept valid checkpoint types", () => {
    for (const t of VALID_TYPES) {
      expect(["photo", "screenshot", "audio", null].includes(t)).toBe(true);
    }
  });

  it("should have correct display mapping", () => {
    const displayMap = {
      photo: { label: "拍照", icon: "📸" },
      screenshot: { label: "截图", icon: "🖥️" },
      audio: { label: "录音", icon: "🎵" },
    } as const;

    expect(displayMap.photo.icon).toBe("📸");
    expect(displayMap.screenshot.label).toBe("截图");
    expect(displayMap.audio.icon).toBe("🎵");
  });

  it("should treat null/empty as no requirement", () => {
    const checkRequiresCheckpoint = (type: string | null | undefined) => {
      return !!type && ["photo", "screenshot", "audio"].includes(type);
    };

    expect(checkRequiresCheckpoint(null)).toBe(false);
    expect(checkRequiresCheckpoint(undefined)).toBe(false);
    expect(checkRequiresCheckpoint("")).toBe(false);
    expect(checkRequiresCheckpoint("photo")).toBe(true);
    expect(checkRequiresCheckpoint("screenshot")).toBe(true);
    expect(checkRequiresCheckpoint("audio")).toBe(true);
    expect(checkRequiresCheckpoint("invalid")).toBe(false);
  });
});

// Check-in overdue detection
describe("Overdue detection", () => {
  function isOverdue(cutoffTime: string | null, referenceTime: Date = new Date()): boolean {
    if (!cutoffTime) return false;
    const [hours, minutes] = cutoffTime.split(":").map(Number);
    const cutoff = new Date(referenceTime);
    cutoff.setHours(hours, minutes, 0, 0);
    return referenceTime > cutoff;
  }

  it("should return false when no cutoff time set", () => {
    expect(isOverdue(null)).toBe(false);
  });

  it("should detect overdue when time is past cutoff", () => {
    const reference = new Date("2026-04-08T21:00:00");
    expect(isOverdue("20:00", reference)).toBe(true);
  });

  it("should return not overdue when time is before cutoff", () => {
    const reference = new Date("2026-04-08T18:30:00");
    expect(isOverdue("20:00", reference)).toBe(false);
  });

  it("should handle midnight cutoff", () => {
    const reference = new Date("2026-04-08T23:59:59");
    expect(isOverdue("00:00", reference)).toBe(true);
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
