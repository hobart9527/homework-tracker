import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ChildrenListPage from "@/app/(parent)/children/page";

const supabaseClient = {
  auth: {
    getSession: vi.fn().mockResolvedValue({
      data: {
        session: {
          user: { id: "parent-1" },
        },
      },
    }),
  },
  from: vi.fn((table: string) => {
    if (table === "children") {
      return {
        select: () => ({
          eq: vi.fn().mockResolvedValue({
            data: [
              {
                id: "child-1",
                parent_id: "parent-1",
                name: "Mia",
                age: 8,
                gender: "female",
                points: 12,
                streak_days: 3,
                avatar: "🦊",
              },
            ],
          }),
        }),
        delete: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ error: null }),
        })),
      };
    }

    return {
      select: vi.fn(),
    };
  }),
};

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => supabaseClient,
}));

describe("ChildrenListPage", () => {
  it("renders per-child links for child-owned integrations only", async () => {
    render(<ChildrenListPage />);

    await waitFor(() => {
      expect(screen.getByText("孩子相关集成")).toBeInTheDocument();
      expect(screen.getByText("Mia")).toBeInTheDocument();
    });

    expect(
      screen.getByRole("link", { name: "前往家庭设置" })
    ).toHaveAttribute("href", "/settings");

    expect(
      screen.getByRole("link", { name: "学习平台账号" })
    ).toHaveAttribute(
      "href",
      "/settings/integrations?childId=child-1#platform-binding"
    );

    expect(
      screen.getByRole("link", { name: "默认消息路由" })
    ).toHaveAttribute(
      "href",
      "/settings/integrations?childId=child-1#message-routing"
    );
  });
});
