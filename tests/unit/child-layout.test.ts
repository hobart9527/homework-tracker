import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Child layout points contract", () => {
  const childLayoutSource = readFileSync(
    resolve(process.cwd(), "src/app/(child)/layout.tsx"),
    "utf8"
  );

  it("calculates header points from points_earned without relying on is_scored", () => {
    expect(childLayoutSource).toMatch(/select\("points_earned"\)/);
    expect(childLayoutSource).not.toMatch(/eq\("is_scored",\s*true\)/);
  });

  it("refreshes the header points when child check-ins change", () => {
    expect(childLayoutSource).toMatch(/child-points-changed/);
    expect(childLayoutSource).toMatch(/window\.addEventListener\("child-points-changed"/);
  });
});
