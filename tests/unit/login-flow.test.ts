import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

// Parent passcode login flow simulation
describe("Parent login flow", () => {
  interface ParentsTable {
    id: string;
    passcode: string;
  }

  interface AuthUser {
    id: string;
    email: string;
  }

  interface Session {
    user: AuthUser;
    access_token: string;
  }

  function simulatePasscodeLogin(
    passcodeInput: string,
    parents: ParentsTable[],
    authUsers: AuthUser[]
  ): { session: Session | null; error: string | null } {
    // Step 1: Query parent by passcode
    const parent = parents.find((candidateParent) => {
      if (candidateParent.passcode !== passcodeInput) {
        return false;
      }

      return authUsers.some(
        (user) =>
          user.id === candidateParent.id &&
          user.email === `${candidateParent.id}@parent.local`
      );
    });
    if (!parent) {
      return { session: null, error: "密码错误，请重试" };
    }

    // Step 2: Auth sign in with email
    const authUser = authUsers.find(u =>
      u.email === `${parent.id}@parent.local` && u.id === parent.id
    );
    if (!authUser) {
      return { session: null, error: "登录失败，请重试" };
    }

    return {
      session: { user: authUser, access_token: "fake-token" },
      error: null,
    };
  }

  const parents: ParentsTable[] = [
    { id: "p1", passcode: "0000" },
  ];

  const authUsers: AuthUser[] = [
    { id: "p1", email: "p1@parent.local" },
  ];

  it("should login with correct passcode", () => {
    const result = simulatePasscodeLogin("0000", parents, authUsers);
    expect(result.session).not.toBeNull();
    expect(result.error).toBeNull();
  });

  it("should fail with wrong passcode", () => {
    const result = simulatePasscodeLogin("1234", parents, authUsers);
    expect(result.session).toBeNull();
    expect(result.error).toBe("密码错误，请重试");
  });

  it("should fail with empty passcode", () => {
    const result = simulatePasscodeLogin("", parents, authUsers);
    expect(result.session).toBeNull();
  });

  it("should return session with correct auth user", () => {
    const result = simulatePasscodeLogin("0000", parents, authUsers);
    expect(result.session?.user.email).toBe("p1@parent.local");
    expect(result.session?.user.id).toBe("p1");
  });

  it("should prefer the parent record that still has a matching auth user when passcodes are duplicated", () => {
    const duplicateParents: ParentsTable[] = [
      { id: "legacy-parent", passcode: "0000" },
      { id: "p1", passcode: "0000" },
    ];

    const result = simulatePasscodeLogin("0000", duplicateParents, authUsers);

    expect(result.session?.user.id).toBe("p1");
    expect(result.error).toBeNull();
  });
});

describe("Child auth contract", () => {
  it("creates child auth email from child id", () => {
    const childId = "c1";
    const authEmail = `${childId}@child.local`;
    expect(authEmail).toBe("c1@child.local");
  });

  it("does not expose password_hash in child lookup shape", () => {
    const baseMigration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/003_login_functions.sql"),
      "utf8"
    );
    const overrideMigration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/005_case_insensitive_child_login.sql"),
      "utf8"
    );

    expect(baseMigration).not.toMatch(/password_hash/i);
    expect(overrideMigration).not.toMatch(/password_hash/i);
    expect(baseMigration).toMatch(/RETURNS TABLE\s*\(\s*id UUID,\s*name TEXT,\s*avatar TEXT\s*\)/s);
    expect(overrideMigration).toMatch(/RETURNS TABLE\s*\(\s*id UUID,\s*name TEXT,\s*avatar TEXT\s*\)/s);
  });
});

// Child login flow simulation
describe("Child login flow", () => {
  interface Child {
    id: string;
    name: string;
    parent_id: string;
  }

  interface AuthUser {
    id: string;
    email: string;
    password: string;
  }

  function simulateChildLogin(
    nameInput: string,
    passwordInput: string,
    children: Child[],
    authUsers: AuthUser[]
  ): { success: boolean; error: string | null } {
    // Step 1: Look up child by name
    const child = children.find((c) => c.name.toLowerCase() === nameInput.toLowerCase());
    if (!child) {
      return { success: false, error: "找不到孩子，请先添加孩子" };
    }

    const expectedEmail = `${child.id}@child.local`;
    const authUser = authUsers.find(
      (u) => u.id === child.id && u.email === expectedEmail && u.password === passwordInput
    );
    if (!authUser) {
      return { success: false, error: "密码错误，请重试" };
    }

    return { success: true, error: null };
  }

  const children: Child[] = [
    { id: "c1", name: "Ivy", parent_id: "p1" },
    { id: "c2", name: "Albert", parent_id: "p1" },
  ];

  const authUsers: AuthUser[] = [
    { id: "c1", email: "c1@child.local", password: "ivy123" },
    { id: "c2", email: "c2@child.local", password: "albert123" },
  ];

  it("should login child with correct name and password", () => {
    const result = simulateChildLogin("Ivy", "ivy123", children, authUsers);
    expect(result.success).toBe(true);
    expect(result.error).toBeNull();
  });

  it("should fail with non-existent child name", () => {
    const result = simulateChildLogin("Bob", "pass", children, authUsers);
    expect(result.success).toBe(false);
    expect(result.error).toBe("找不到孩子，请先添加孩子");
  });

  it("should fail with wrong password", () => {
    const result = simulateChildLogin("Ivy", "wrong", children, authUsers);
    expect(result.success).toBe(false);
    expect(result.error).toBe("密码错误，请重试");
  });

  it("should handle case-insensitive child name (simulated at SQL level via ILIKE/LOWER)", () => {
    // The SQL function uses LOWER(), so "ivy", "IVY", "Ivy" all match
    // The front-end passes whatever case the user types
    const result = simulateChildLogin("iVy", "ivy123", children, authUsers);
    expect(result.success).toBe(true);
  });

  it("routes children to the canonical home page after login", () => {
    const childLoginPage = readFileSync(
      resolve(process.cwd(), "src/app/child-login/page.tsx"),
      "utf8"
    );

    expect(childLoginPage).toMatch(/router\.replace\("\/"\)/);
    expect(childLoginPage).not.toMatch(/router\.replace\("\/today"\)/);
  });
});
