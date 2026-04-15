import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl/middleware", () => ({
  default: () => () => undefined,
}));

import {
  isChildProtectedPath,
  isParentProtectedPath,
  normalizeProtectedPath,
} from "@/middleware";

describe("middleware path matching", () => {
  it("keeps auth pages public", () => {
    expect(isChildProtectedPath("/child-login")).toBe(false);
    expect(isChildProtectedPath("/login")).toBe(false);
    expect(isChildProtectedPath("/en/child-login")).toBe(false);
    expect(isParentProtectedPath("/en/login")).toBe(false);
  });

  it("protects the child home and child routes only", () => {
    expect(isChildProtectedPath("/")).toBe(true);
    expect(isChildProtectedPath("/progress")).toBe(true);
    expect(isChildProtectedPath("/rewards")).toBe(true);
    expect(isChildProtectedPath("/en/progress")).toBe(true);
    expect(isChildProtectedPath("/children")).toBe(false);
  });

  it("normalizes locale-prefixed paths before matching", () => {
    expect(normalizeProtectedPath("/en")).toBe("/");
    expect(normalizeProtectedPath("/en/dashboard")).toBe("/dashboard");
    expect(isParentProtectedPath("/en/dashboard")).toBe(true);
  });
});
