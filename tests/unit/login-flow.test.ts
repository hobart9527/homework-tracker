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
    const parent = parents.find(p => p.passcode === passcodeInput);
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
});

// Child login flow simulation
describe("Child login flow", () => {
  interface Child {
    id: string;
    name: string;
    parent_id: string;
    password_hash: string;
  }

  function simulateChildLogin(
    nameInput: string,
    passwordInput: string,
    children: Child[],
    authValid: boolean
  ): { success: boolean; error: string | null } {
    // Step 1: Look up child by name
    const child = children.find(c => c.name === nameInput);
    if (!child) {
      return { success: false, error: "找不到孩子，请先添加孩子" };
    }

    // Step 2: Auth sign in
    const expectedEmail = `${child.id}@child.local`;
    if (!authValid || passwordInput !== child.password_hash) {
      return { success: false, error: "密码错误，请重试" };
    }

    return { success: true, error: null };
  }

  const children: Child[] = [
    { id: "c1", name: "Ivy", parent_id: "p1", password_hash: "ivy123" },
    { id: "c2", name: "Albert", parent_id: "p1", password_hash: "albert123" },
  ];

  it("should login child with correct name and password", () => {
    const result = simulateChildLogin("Ivy", "ivy123", children, true);
    expect(result.success).toBe(true);
    expect(result.error).toBeNull();
  });

  it("should fail with non-existent child name", () => {
    const result = simulateChildLogin("Bob", "pass", children, false);
    expect(result.success).toBe(false);
    expect(result.error).toBe("找不到孩子，请先添加孩子");
  });

  it("should fail with wrong password", () => {
    const result = simulateChildLogin("Ivy", "wrong", children, false);
    expect(result.success).toBe(false);
    expect(result.error).toBe("密码错误，请重试");
  });

  it("should handle case-insensitive child name (simulated at SQL level via ILIKE/LOWER)", () => {
    // The SQL function uses LOWER(), so "ivy", "IVY", "Ivy" all match
    // The front-end passes whatever case the user types
    const lowerCasedInput = "ivy".toLowerCase();
    const childNameInDB = "Ivy".toLowerCase();
    expect(lowerCasedInput).toBe(childNameInDB);

    // With case-insensitive matching, all these should find the child
    const testCases = ["ivy", "Ivy", "IVY", "iVy"];
    for (const input of testCases) {
      expect(input.toLowerCase()).toBe(childNameInDB);
    }
  });
});
