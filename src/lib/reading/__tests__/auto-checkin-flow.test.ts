import { describe, it, expect, vi } from "vitest";
import {
  createReadingAutoCheckinServer,
  shouldAutoCompleteReading,
  type ReadingCheckinResult,
} from "@/lib/auto-checkins";

/* ── Homeworks data ── */

const mockHomeworkZh = {
  id: "hw-zh-1",
  type_name: "阅读",
  point_value: 10,
  required_checkpoint_type: null,
  type_group_id: "group-zh",
  group: { name: "中文" },
};

const mockHomeworkEn = {
  id: "hw-en-1",
  type_name: "英文阅读",
  point_value: 10,
  required_checkpoint_type: null,
  type_group_id: "group-en",
  group: { name: "英文" },
};

const mockHomeworkAudio = {
  id: "hw-audio-1",
  type_name: "阅读",
  point_value: 10,
  required_checkpoint_type: "audio",
  type_group_id: "group-zh",
  group: { name: "中文" },
};

/* ── Helper: create a supabase mock ── */

function createMockChain(opts: {
  homeworks: unknown[] | null;
  existingCheckIns: unknown[] | null;
  insertResult?: { data: unknown | null; error: { message: string } | null };
  updateResult?: { error: { message: string } | null };
  articleLang?: string | null;
}) {
  // A chainable builder that records calls and returns the next level.
  const buildChain = (handlers: Record<string, unknown>) => {
    const chain = {} as Record<string, unknown>;
    for (const [key, val] of Object.entries(handlers)) {
      chain[key] = typeof val === "function" ? val : () => chain;
    }
    return chain;
  };

  const homeworks = opts.homeworks;
  const existingCheckIns = opts.existingCheckIns;
  const insertResult = opts.insertResult ?? { data: { id: "new-ck-1" }, error: null };
  const updateResult = opts.updateResult ?? { error: null };
  const articleLang = opts.articleLang ?? "zh";

  return {
    from: vi.fn((table: string) => {
      if (table === "homeworks") {
        return buildChain({
          select: () =>
            buildChain({
              eq: () => ({
                // terminal — returns data
                _result: homeworks ?? [],
                then: (resolve: (v: unknown) => void) => {
                  resolve({ data: homeworks ?? [], error: null });
                },
              }),
            }),
        });
      }

      if (table === "check_ins") {
        return buildChain({
          select: () =>
            buildChain({
              eq: () =>
                buildChain({
                  gte: () =>
                    buildChain({
                      lte: () =>
                        buildChain({
                          // terminal for select with gte/lte
                          _result: existingCheckIns ?? [],
                          then: (resolve: (v: unknown) => void) => {
                            resolve({ data: existingCheckIns ?? [], error: null });
                          },
                        }),
                    }),
                }),
            }),
          insert: () =>
            buildChain({
              select: () =>
                buildChain({
                  single: () => ({
                    _result: insertResult,
                    then: (resolve: (v: unknown) => void) => {
                      resolve(insertResult);
                    },
                  }),
                }),
            }),
          update: () =>
            buildChain({
              eq: () =>
                buildChain({
                  then: (resolve: (v: unknown) => void) => {
                    resolve(updateResult);
                  },
                }),
            }),
        });
      }

      if (table === "reading_articles") {
        return buildChain({
          select: () =>
            buildChain({
              eq: () =>
                buildChain({
                  single: () =>
                    buildChain({
                      _result: { data: { language: articleLang }, error: null },
                      then: (resolve: (v: unknown) => void) => {
                        resolve({ data: { language: articleLang }, error: null });
                      },
                    }),
                }),
            }),
        });
      }

      return buildChain({});
    }),
  };
}

describe("createReadingAutoCheckinServer", () => {
  it("(a) created on first attempt — no existing check_in today", async () => {
    const supabase = createMockChain({
      homeworks: [mockHomeworkZh],
      existingCheckIns: [], // no existing checkins today
      insertResult: { data: { id: "new-ck-1" }, error: null },
    });

    const result = await createReadingAutoCheckinServer({
      supabase,
      childId: "child-1",
      articleId: "art-1",
      articleLanguage: "zh",
      score: 8,
      total: 10,
    });

    expect(result.status).toBe("created");
    expect(result.check_in_id).toBe("new-ck-1");
    expect(result.homework_id).toBe("hw-zh-1");
  });

  it("(b) deduped on second attempt — same article check_in exists today", async () => {
    const supabase = createMockChain({
      homeworks: [mockHomeworkZh],
      existingCheckIns: [
        { id: "existing-ck-1", note: "中文阅读自动打卡 — 文章: art-1, 得分: 5/10" },
      ],
    });

    const result = await createReadingAutoCheckinServer({
      supabase,
      childId: "child-1",
      articleId: "art-1",
      articleLanguage: "zh",
      score: 9,
      total: 10,
    });

    expect(result.status).toBe("deduped");
    expect(result.check_in_id).toBe("existing-ck-1");
    expect(result.homework_id).toBe("hw-zh-1");
  });

  it("(c) skipped when no matching homework", async () => {
    const supabase = createMockChain({
      homeworks: [mockHomeworkAudio], // has required_checkpoint_type=audio → filtered out
      existingCheckIns: [],
    });

    const result = await createReadingAutoCheckinServer({
      supabase,
      childId: "child-1",
      articleId: "art-1",
      articleLanguage: "zh",
      score: 8,
      total: 10,
    });

    expect(result.status).toBe("skipped");
    expect(result.reason).toContain("matching");
    expect(result.homework_id).toBeNull();
  });

  it("(c) skipped when no homeworks at all", async () => {
    const supabase = createMockChain({
      homeworks: [],
      existingCheckIns: [],
    });

    const result = await createReadingAutoCheckinServer({
      supabase,
      childId: "child-1",
      articleId: "art-1",
      articleLanguage: "zh",
      score: 8,
      total: 10,
    });

    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("No reading homeworks found");
    expect(result.homework_id).toBeNull();
  });

  it("(d) failed surfaces underlying error message", async () => {
    const supabase = createMockChain({
      homeworks: [mockHomeworkZh],
      existingCheckIns: [],
      insertResult: { data: null, error: { message: "duplicate key violation" } },
    });

    const result = await createReadingAutoCheckinServer({
      supabase,
      childId: "child-1",
      articleId: "art-1",
      articleLanguage: "zh",
      score: 8,
      total: 10,
    });

    expect(result.status).toBe("failed");
    expect(result.reason).toContain("duplicate key violation");
    expect(result.homework_id).toBe("hw-zh-1");
  });

  it("skipped when english homework but no english group match", async () => {
    // Only zh homework exists, article is english
    const supabase = createMockChain({
      homeworks: [mockHomeworkZh],
      existingCheckIns: [],
    });

    const result = await createReadingAutoCheckinServer({
      supabase,
      childId: "child-1",
      articleId: "art-1",
      articleLanguage: "en",
      score: 8,
      total: 10,
    });

    expect(result.status).toBe("skipped");
    expect(result.homework_id).toBeNull();
  });
});

describe("shouldAutoCompleteReading", () => {
  it("returns true for 阅读 with no recording", () => {
    expect(
      shouldAutoCompleteReading({ type_name: "阅读", required_checkpoint_type: null })
    ).toBe(true);
  });

  it("returns false for 阅读 with audio required", () => {
    expect(
      shouldAutoCompleteReading({ type_name: "阅读", required_checkpoint_type: "audio" })
    ).toBe(false);
  });

  it("returns true for 英文阅读 and 中文阅读", () => {
    expect(
      shouldAutoCompleteReading({ type_name: "英文阅读", required_checkpoint_type: null })
    ).toBe(true);
    expect(
      shouldAutoCompleteReading({ type_name: "中文阅读", required_checkpoint_type: null })
    ).toBe(true);
  });
});
