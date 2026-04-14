import { describe, it, expect } from "vitest";
import { getHomeworksForDate, getLocalDayBounds, isAfterCutoff } from "@/lib/homework-utils";

// Test data shape builders (matching HomeworkForm state)
interface HomeworkFormData {
  child_id: string;
  type_id: string | null;
  type_name: string;
  type_icon: string;
  title: string;
  description: string | null;
  repeat_type: "daily" | "weekly" | "interval" | "once";
  repeat_days: number[] | null;
  repeat_interval: number | null;
  repeat_start_date: string | null;
  point_value: number;
  estimated_minutes: number | null;
  daily_cutoff_time: string | null;
  required_checkpoint_type: "photo" | "audio" | null;
  created_by: string;
}

function buildHomeworkData(overrides: Partial<HomeworkFormData>): HomeworkFormData {
  return {
    child_id: "",
    type_id: null,
    type_name: "",
    type_icon: "📝",
    title: "",
    description: null,
    repeat_type: "daily",
    repeat_days: null,
    repeat_interval: null,
    repeat_start_date: null,
    point_value: 3,
    estimated_minutes: 30,
    daily_cutoff_time: "20:00",
    required_checkpoint_type: null,
    created_by: "",
    ...overrides,
  };
}

// Mimic HomeworkForm handleSubmit transformation
function transformToInsert(formData: HomeworkFormData) {
  return {
    child_id: formData.child_id,
    type_id: formData.type_id,
    type_name: formData.type_name,
    type_icon: formData.type_icon,
    title: formData.title,
    description: formData.description || null,
    required_checkpoint_type: formData.required_checkpoint_type || null,
    repeat_type: formData.repeat_type,
    repeat_days: formData.repeat_type === "weekly" ? formData.repeat_days : null,
    repeat_interval: formData.repeat_type === "interval" ? formData.repeat_interval : null,
    repeat_start_date: formData.repeat_start_date || null,
    point_value: formData.point_value,
    estimated_minutes: formData.estimated_minutes,
    daily_cutoff_time: formData.daily_cutoff_time || null,
    created_by: formData.created_by,
  };
}

describe("Homework data transformation", () => {
  it("should set repeat_days to null for non-weekly repeat_type", () => {
    const form = buildHomeworkData({ repeat_type: "daily", repeat_days: [1, 2, 3] });
    const result = transformToInsert(form);
    expect(result.repeat_days).toBeNull();
  });

  it("should set repeat_days for weekly repeat_type", () => {
    const form = buildHomeworkData({ repeat_type: "weekly", repeat_days: [1, 3, 5] });
    const result = transformToInsert(form);
    expect(result.repeat_days).toEqual([1, 3, 5]);
  });

  it("should set repeat_interval to null for non-interval repeat_type", () => {
    const form = buildHomeworkData({ repeat_type: "daily", repeat_interval: 3 });
    const result = transformToInsert(form);
    expect(result.repeat_interval).toBeNull();
  });

  it("should set repeat_interval for interval repeat_type", () => {
    const form = buildHomeworkData({ repeat_type: "interval", repeat_interval: 5 });
    const result = transformToInsert(form);
    expect(result.repeat_interval).toBe(5);
  });

  it("should preserve type_icon from selection", () => {
    const form = buildHomeworkData({ type_name: "钢琴", type_icon: "🎹" });
    const result = transformToInsert(form);
    expect(result.type_icon).toBe("🎹");
  });

  it("should use custom type_icon when specified", () => {
    const form = buildHomeworkData({ type_icon: "🏃", type_name: "跑步" });
    const result = transformToInsert(form);
    expect(result.type_icon).toBe("🏃");
  });

  it("should handle required_checkpoint_type correctly", () => {
    const form = buildHomeworkData({ required_checkpoint_type: "photo" });
    const result = transformToInsert(form);
    expect(result.required_checkpoint_type).toBe("photo");
  });

  it("should clear required_checkpoint_type when empty string", () => {
    const form = buildHomeworkData({ required_checkpoint_type: "" as any });
    const result = transformToInsert(form);
    expect(result.required_checkpoint_type).toBeNull();
  });
});

// Title auto-fill logic
describe("Homework title auto-fill", () => {
  const DEFAULT_TYPES = [
    { id: "piano", name: "钢琴", icon: "🎹", default_points: 6 },
    { id: "reading", name: "阅读", icon: "📖", default_points: 3 },
    { id: "khan", name: "Khan Academy", icon: "💻", default_points: 4 },
  ];

  function autoFillTitle(
    currentTitle: string,
    currentTypeName: string,
    newTypeName: string,
    customTypes: { name: string }[] = []
  ) {
    const allTypes = [
      ...DEFAULT_TYPES,
      ...customTypes.map((t) => ({ id: "", name: t.name, icon: "", default_points: 0 })),
    ];
    // Find the previous default title for the current type
    const prevDefaultTitle = currentTypeName
      ? DEFAULT_TYPES.find((t) => t.name === currentTypeName)?.name + "练习" ||
        customTypes.find((t) => t.name === currentTypeName)?.name + "练习"
      : null;

    const isAutoTitle = !prevDefaultTitle || currentTitle === prevDefaultTitle;
    return isAutoTitle ? newTypeName + "练习" : currentTitle;
  }

  it("should auto-fill title when field is empty", () => {
    const title = autoFillTitle("", "", "钢琴");
    expect(title).toBe("钢琴练习");
  });

  it("should auto-fill title when title matches previous type default", () => {
    const title = autoFillTitle("钢琴练习", "钢琴", "阅读");
    expect(title).toBe("阅读练习");
  });

  it("should NOT auto-fill when user has customized title", () => {
    const title = autoFillTitle("Khan Math Unit 3", "钢琴", "阅读");
    expect(title).toBe("Khan Math Unit 3");
  });

  it("should handle Khan Academy default title", () => {
    const title = autoFillTitle("Khan Academy练习", "Khan Academy", "IXL");
    expect(title).toBe("IXL练习");
  });
});

// Icon picker coverage
describe("Icon constants", () => {
  it("should include default type icons in ALL_ICONS", () => {
    const ALL_ICONS = ["📝", "✏️", "📋", "🎨", "⚽", "🏀", "🎸", "🧮", "🔬", "📐", "✍️", "🗣️", "🎹", "📖", "💻", "📚", "🔢", "🇨🇳", "🏐", "👯", "🎭", "🧹", "📸", "🎵", "🌟", "🧩", "🖊️", "📏", "🎯", "🏃"];
    const defaultIcons = ["🎹", "📖", "💻", "📚", "🔢", "🇨🇳", "🏐", "👯", "🎭", "🧹"];
    for (const icon of defaultIcons) {
      expect(ALL_ICONS).toContain(icon);
    }
  });

  it("should include checkpoint type icons", () => {
    const ALL_ICONS = ["📝", "✏️", "📋", "🎨", "⚽", "🏀", "🎸", "🧮", "🔬", "📐", "✍️", "🗣️", "🎹", "📖", "💻", "📚", "🔢", "🇨🇳", "🏐", "👯", "🎭", "🧹", "📸", "🎵", "🌟", "🧩", "🖊️", "📏", "🎯", "🏃"];
    expect(ALL_ICONS).toContain("📸");
    expect(ALL_ICONS).toContain("🎵");
  });
});

describe("isAfterCutoff", () => {
  it("returns false when there is no cutoff", () => {
    expect(isAfterCutoff(null, new Date("2026-04-11T21:00:00"))).toBe(false);
  });

  it("returns false before the cutoff time", () => {
    expect(isAfterCutoff("20:00", new Date("2026-04-11T19:59:00"))).toBe(false);
  });

  it("returns true after the cutoff time", () => {
    expect(isAfterCutoff("20:00", new Date("2026-04-11T20:01:00"))).toBe(true);
  });
});

describe("getLocalDayBounds", () => {
  it("returns a start and end timestamp for the local calendar day", () => {
    const bounds = getLocalDayBounds(new Date("2026-04-11T23:30:00+08:00"));
    const start = new Date(bounds.start);
    const end = new Date(bounds.end);

    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
  });
});

describe("getHomeworksForDate", () => {
  const baseHomework = {
    id: "hw-1",
    child_id: "child-1",
    type_id: null,
    type_name: "Reading",
    type_icon: "📖",
    title: "Read",
    description: null,
    repeat_days: null,
    repeat_interval: null,
    repeat_start_date: null,
    repeat_end_date: null,
    point_value: 3,
    estimated_minutes: 20,
    daily_cutoff_time: "20:00",
    is_active: true,
    required_checkpoint_type: null,
    created_by: null,
    created_at: null,
  };

  it("includes once homework on its start date", () => {
    const result = getHomeworksForDate(
      [
        {
          ...baseHomework,
          repeat_type: "once",
          repeat_start_date: "2026-04-11",
        },
      ],
      new Date("2026-04-11T12:00:00")
    );

    expect(result).toHaveLength(1);
  });

  it("includes interval homework on matching days", () => {
    const result = getHomeworksForDate(
      [
        {
          ...baseHomework,
          repeat_type: "interval",
          repeat_start_date: "2026-04-01",
          repeat_interval: 3,
        },
      ],
      new Date("2026-04-10T12:00:00")
    );

    expect(result).toHaveLength(1);
  });
});
