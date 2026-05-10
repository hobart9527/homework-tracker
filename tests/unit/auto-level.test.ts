import { describe, it, expect } from 'vitest';
import {
  evaluateAutoLevel,
  recomputeStats,
  nextLevel,
  type AutoLevelInput,
} from '@/lib/reading/auto-level';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function attempt(
  level: string | null,
  score: number,
  total: number,
  iso = '2026-05-10T12:00:00.000Z'
): AutoLevelInput['recentAttempts'][number] {
  return {
    article_raz_level: level,
    score,
    total_questions: total,
    created_at: iso,
  };
}

function baseInput(over: Partial<AutoLevelInput>): AutoLevelInput {
  return {
    language: 'en',
    currentLevel: 'L4',
    maxLevel: null,
    recentAttempts: [],
    stats: {
      total_articles_read: 0,
      articles_at_current_level: 0,
      accuracy_streak: 0,
    },
    ...over,
  };
}

// ---------------------------------------------------------------------------
describe('evaluateAutoLevel — bump_up', () => {
  it('bumps up when 15 articles + streak 3 + no cap', () => {
    const r = evaluateAutoLevel(
      baseInput({
        currentLevel: 'L4',
        stats: {
          total_articles_read: 22,
          articles_at_current_level: 15,
          accuracy_streak: 3,
        },
      })
    );
    expect(r.action).toBe('bump_up');
    if (r.action !== 'bump_up') return;
    expect(r.from).toBe('L4');
    expect(r.to).toBe('L5');
    expect(r.reasons.length).toBeGreaterThan(0);
  });

  it('respects maxLevel cap (G3 capped at L6)', () => {
    const r = evaluateAutoLevel(
      baseInput({
        currentLevel: 'L6',
        maxLevel: 'L6',
        stats: {
          total_articles_read: 30,
          articles_at_current_level: 20,
          accuracy_streak: 5,
        },
      })
    );
    expect(r.action).toBe('hold');
    if (r.action !== 'hold') return;
    expect(r.level).toBe('L6');
    expect(r.reasons.some((s) => s.includes('cap'))).toBe(true);
  });

  it('blocks bump_up when streak < 3', () => {
    const r = evaluateAutoLevel(
      baseInput({
        currentLevel: 'L4',
        stats: {
          total_articles_read: 18,
          articles_at_current_level: 15,
          accuracy_streak: 2,
        },
      })
    );
    expect(r.action).toBe('hold');
    if (r.action !== 'hold') return;
    expect(r.reasons.some((s) => s.includes('streak'))).toBe(true);
  });

  it('blocks bump_up when articles < 15', () => {
    const r = evaluateAutoLevel(
      baseInput({
        currentLevel: 'L4',
        stats: {
          total_articles_read: 14,
          articles_at_current_level: 12,
          accuracy_streak: 5,
        },
      })
    );
    expect(r.action).toBe('hold');
    if (r.action !== 'hold') return;
    expect(r.reasons.some((s) => s.includes('articles'))).toBe(true);
  });

  it('does not bump above L12', () => {
    const r = evaluateAutoLevel(
      baseInput({
        currentLevel: 'L12',
        stats: {
          total_articles_read: 30,
          articles_at_current_level: 20,
          accuracy_streak: 6,
        },
      })
    );
    expect(r.action).toBe('hold');
    if (r.action !== 'hold') return;
    expect(r.reasons.some((s) => s.includes('top level'))).toBe(true);
  });
});

describe('evaluateAutoLevel — bump_down', () => {
  it('bumps down when last 2 at level both <60%', () => {
    const r = evaluateAutoLevel(
      baseInput({
        currentLevel: 'L5',
        recentAttempts: [
          attempt('L5', 2, 5), // 40%
          attempt('L5', 2, 5), // 40%
          attempt('L5', 4, 5), // older — irrelevant
        ],
        stats: {
          total_articles_read: 5,
          articles_at_current_level: 3,
          accuracy_streak: 0,
        },
      })
    );
    expect(r.action).toBe('bump_down');
    if (r.action !== 'bump_down') return;
    expect(r.from).toBe('L5');
    expect(r.to).toBe('L4');
  });

  it('does not bump_down at floor L1', () => {
    const r = evaluateAutoLevel(
      baseInput({
        currentLevel: 'L1',
        recentAttempts: [attempt('L1', 1, 5), attempt('L1', 0, 5)],
        stats: {
          total_articles_read: 2,
          articles_at_current_level: 2,
          accuracy_streak: 0,
        },
      })
    );
    expect(r.action).toBe('hold');
  });

  it('does not bump_down when only 1 recent attempt at level (insufficient evidence)', () => {
    const r = evaluateAutoLevel(
      baseInput({
        currentLevel: 'L5',
        recentAttempts: [attempt('L5', 1, 5), attempt('L4', 1, 5)],
        stats: {
          total_articles_read: 2,
          articles_at_current_level: 1,
          accuracy_streak: 0,
        },
      })
    );
    expect(r.action).toBe('hold');
  });

  it('does not bump_down when one of last 2 is neutral (60%-79%)', () => {
    const r = evaluateAutoLevel(
      baseInput({
        currentLevel: 'L5',
        recentAttempts: [
          attempt('L5', 2, 5), // 40% bad
          attempt('L5', 3, 5), // 60% neutral — protects
        ],
        stats: {
          total_articles_read: 2,
          articles_at_current_level: 2,
          accuracy_streak: 0,
        },
      })
    );
    expect(r.action).toBe('hold');
  });
});

describe('recomputeStats', () => {
  it('counts articles at level and streak (most-recent-first)', () => {
    const attempts = [
      attempt('L4', 5, 5), // good (most-recent)
      attempt('L4', 4, 5), // good (80%)
      attempt('L3', 5, 5), // ignored (other level)
      attempt('L4', 4, 5), // good
      attempt('L4', 2, 5), // bad — streak stops here
      attempt('L4', 5, 5), // good but past the break
      attempt('L3', 1, 5), // other level
    ];
    const s = recomputeStats({ attempts, currentLevel: 'L4' });
    expect(s.total_articles_read).toBe(7);
    expect(s.articles_at_current_level).toBe(5);
    expect(s.accuracy_streak).toBe(3);
  });

  it('streak is 0 when most-recent attempt at level is not good', () => {
    const s = recomputeStats({
      attempts: [attempt('L4', 2, 5), attempt('L4', 5, 5)],
      currentLevel: 'L4',
    });
    expect(s.accuracy_streak).toBe(0);
    expect(s.articles_at_current_level).toBe(2);
  });

  it('handles empty attempts list', () => {
    const s = recomputeStats({ attempts: [], currentLevel: 'L4' });
    expect(s).toEqual({
      total_articles_read: 0,
      articles_at_current_level: 0,
      accuracy_streak: 0,
    });
  });

  it('treats exactly 80% as good (boundary)', () => {
    const s = recomputeStats({
      attempts: [attempt('L4', 4, 5), attempt('L4', 4, 5), attempt('L4', 4, 5)],
      currentLevel: 'L4',
    });
    expect(s.accuracy_streak).toBe(3);
  });
});

describe('nextLevel', () => {
  it('up at L8 with no cap returns L9', () => {
    expect(nextLevel('L8', 'up')).toBe('L9');
  });

  it('up at cap returns same level', () => {
    expect(nextLevel('L6', 'up', 'L6')).toBe('L6');
  });

  it('down at floor L1 returns L1', () => {
    expect(nextLevel('L1', 'down')).toBe('L1');
  });

  it('up at L12 returns L12', () => {
    expect(nextLevel('L12', 'up')).toBe('L12');
  });

  it('down from L4 returns L3', () => {
    expect(nextLevel('L4', 'down')).toBe('L3');
  });
});

describe('purity / immutability', () => {
  it('does not mutate input', () => {
    const input = baseInput({
      currentLevel: 'L4',
      recentAttempts: [attempt('L4', 5, 5)],
      stats: {
        total_articles_read: 16,
        articles_at_current_level: 15,
        accuracy_streak: 3,
      },
    });
    const snapshot = JSON.parse(JSON.stringify(input));
    evaluateAutoLevel(input);
    expect(JSON.parse(JSON.stringify(input))).toEqual(snapshot);
  });
});
