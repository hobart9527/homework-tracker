import { describe, it, expect } from "vitest";
import {
  checkLevelUp,
  checkCanChallenge,
  computeLevelStats,
  type ReadingProgress,
} from "../progression";

function makeProgress(
  currentLevel: "L1" | "L2" | "L3",
  overrides: Partial<ReadingProgress["levelStats"]["L1"]> = {}
): ReadingProgress {
  const base: ReadingProgress["levelStats"]["L1"] = {
    completed: 8,
    correctRate: 0.75,
    lastThreeRates: [0.85, 0.9, 0.7],
    avgDifficultyFeel: 3,
    ...overrides,
  };
  return {
    childId: "test-child",
    currentLevel,
    levelStats: {
      L1: { ...base },
      L2: { completed: 0, correctRate: 0, lastThreeRates: [], avgDifficultyFeel: 0 },
      L3: { completed: 0, correctRate: 0, lastThreeRates: [], avgDifficultyFeel: 0 },
    },
    canLevelUp: false,
    canChallenge: false,
  };
}

describe("checkLevelUp", () => {
  it("returns false when hard gate not met (completed < 8)", () => {
    const p = makeProgress("L1", { completed: 7, correctRate: 0.8 });
    expect(checkLevelUp(p)).toBe(false);
  });

  it("returns false when hard gate not met (correctRate < 0.75)", () => {
    const p = makeProgress("L1", { completed: 10, correctRate: 0.7 });
    expect(checkLevelUp(p)).toBe(false);
  });

  it("returns true when hard gate + soft signal 1 (2 recent >= 0.85)", () => {
    const p = makeProgress("L1", {
      completed: 8,
      correctRate: 0.75,
      lastThreeRates: [0.85, 0.9, 0.5],
    });
    expect(checkLevelUp(p)).toBe(true);
  });

  it("returns true when hard gate + soft signal 2 (avgDifficultyFeel <= 3)", () => {
    const p = makeProgress("L1", {
      completed: 8,
      correctRate: 0.75,
      lastThreeRates: [0.5, 0.6, 0.7],
      avgDifficultyFeel: 3,
    });
    expect(checkLevelUp(p)).toBe(true);
  });

  it("returns false when hard gate met but no soft signal", () => {
    const p = makeProgress("L1", {
      completed: 8,
      correctRate: 0.75,
      lastThreeRates: [0.5, 0.6, 0.7],
      avgDifficultyFeel: 4,
    });
    expect(checkLevelUp(p)).toBe(false);
  });

  it("returns false when only 1 recent rate >= 0.85", () => {
    const p = makeProgress("L1", {
      completed: 8,
      correctRate: 0.75,
      lastThreeRates: [0.85, 0.5, 0.6],
      avgDifficultyFeel: 4,
    });
    expect(checkLevelUp(p)).toBe(false);
  });
});

describe("checkCanChallenge", () => {
  it("returns false when no progress", () => {
    const p = makeProgress("L1", { completed: 0, correctRate: 0 });
    expect(checkCanChallenge(p)).toBe(false);
  });

  it("returns true when some progress but not enough to level up", () => {
    const p = makeProgress("L1", {
      completed: 5,
      correctRate: 0.6,
      lastThreeRates: [0.5, 0.6, 0.7],
      avgDifficultyFeel: 4,
    });
    expect(checkCanChallenge(p)).toBe(true);
  });

  it("returns false when already can level up", () => {
    const p = makeProgress("L1", {
      completed: 8,
      correctRate: 0.75,
      lastThreeRates: [0.85, 0.9, 1.0],
    });
    expect(checkCanChallenge(p)).toBe(false);
  });
});

describe("computeLevelStats", () => {
  it("computes stats correctly from history", () => {
    const history = [
      { level_variant: "L1", correct_count: 4, total_questions: 5, difficulty_feel: 2 },
      { level_variant: "L1", correct_count: 3, total_questions: 5, difficulty_feel: 3 },
      { level_variant: "L1", correct_count: 5, total_questions: 5, difficulty_feel: 2 },
    ];
    const stats = computeLevelStats(history);
    expect(stats.L1.completed).toBe(3);
    expect(stats.L1.correctRate).toBe(12 / 15);
    expect(stats.L1.lastThreeRates).toEqual([0.8, 0.6, 1]);
    expect(stats.L1.avgDifficultyFeel).toBeCloseTo(7 / 3);
  });

  it("ignores rows with unknown level_variant", () => {
    const history = [
      { level_variant: "L1", correct_count: 5, total_questions: 5, difficulty_feel: 2 },
      { level_variant: "L99", correct_count: 0, total_questions: 5, difficulty_feel: 5 },
    ];
    const stats = computeLevelStats(history);
    expect(stats.L1.completed).toBe(1);
    expect(stats.L2.completed).toBe(0);
  });
});
