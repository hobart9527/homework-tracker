import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { QuickTypeManager } from "@/components/parent/QuickTypeManager";
import type { Database } from "@/lib/supabase/types";

type CustomType = Database["public"]["Tables"]["custom_homework_types"]["Row"];

describe("QuickTypeManager", () => {
  it("renders a list of existing types", () => {
    const types = [
      { id: "1", name: "钢琴", icon: "🎹", default_points: 6, parent_id: "p1", created_at: "" } as CustomType,
    ];
    render(
      <QuickTypeManager
        types={types}
        onAdd={async () => {}}
        onUpdate={async () => {}}
        onDelete={async () => {}}
      />
    );
    expect(screen.getByText("钢琴")).toBeInTheDocument();
    expect(screen.getByText("🎹")).toBeInTheDocument();
  });

  it("renders an add button", () => {
    render(
      <QuickTypeManager
        types={[]}
        onAdd={async () => {}}
        onUpdate={async () => {}}
        onDelete={async () => {}}
      />
    );
    expect(screen.getByRole("button", { name: "新增类型" })).toBeInTheDocument();
  });
});
