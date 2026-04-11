import { describe, it, expect } from "vitest";

describe("Homework repeat rule filtering", () => {
  const homeworks = [
    {
      id: "1",
      repeat_type: "daily",
      repeat_days: null,
      repeat_interval: null,
      is_active: true,
    },
    {
      id: "2",
      repeat_type: "weekly",
      repeat_days: [1, 3, 5], // Mon, Wed, Fri
      repeat_interval: null,
      is_active: true,
    },
    {
      id: "3",
      repeat_type: "once",
      repeat_days: null,
      repeat_interval: null,
      repeat_start_date: "2026-04-08",
      is_active: true,
    },
  ];

  it("should include daily homeworks for any day", () => {
    const today = new Date().getDay();
    const result = homeworks.filter((hw) => {
      if (!hw.is_active) return false;
      if (hw.repeat_type === "daily") return true;
      return false;
    });
    expect(result.length).toBe(1);
    expect(result[0].id).toBe("1");
  });

  it("should filter weekly homeworks by day of week", () => {
    const dayOfWeek = 1; // Monday
    const result = homeworks.filter((hw) => {
      if (!hw.is_active) return false;
      if (hw.repeat_type === "weekly") {
        return hw.repeat_days?.includes(dayOfWeek);
      }
      return false;
    });
    expect(result.length).toBe(1);
    expect(result[0].id).toBe("2");
  });
});
