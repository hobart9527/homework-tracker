import { describe, expect, it } from "vitest";
import { buildNewHomeworkHref } from "@/lib/homework-form";

describe("buildNewHomeworkHref", () => {
  it("includes childId when a single child is selected", () => {
    expect(buildNewHomeworkHref({ selectedChildId: "child-1" })).toBe(
      "/homework/new?childId=child-1"
    );
  });

  it("omits childId when all children are selected", () => {
    expect(buildNewHomeworkHref({ selectedChildId: "all" })).toBe("/homework/new");
  });

  it("omits childId when selectedChildId is null", () => {
    expect(buildNewHomeworkHref({ selectedChildId: null })).toBe("/homework/new");
  });
});
