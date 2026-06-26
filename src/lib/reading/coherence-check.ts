/**
 * Cross-chapter coherence check for reading articles.
 * Runs after chapter generation to catch structural issues.
 */

import type { ArticleChapter } from "./types";

export interface CoherenceIssue {
  code: string;
  severity: "warn" | "error";
  message: string;
  chapterIndex?: number;
}

export interface CoherenceCheckResult {
  pass: boolean;
  issues: CoherenceIssue[];
}

export function checkChapterCoherence(
  chapters: ArticleChapter[],
  grade: number,
  language: "en" | "zh"
): CoherenceCheckResult {
  const issues: CoherenceIssue[] = [];

  if (chapters.length < 2) {
    return { pass: true, issues: [] };
  }

  chapters.forEach((ch, i) => {
    if (!ch.content || ch.content.trim().length < 50) {
      issues.push({
        code: "chapter-empty",
        severity: "error",
        message: `Chapter ${i + 1} has insufficient content (${ch.content?.length || 0} chars)`,
        chapterIndex: i,
      });
    }
  });

  chapters.forEach((ch, i) => {
    if (ch.word_count > 0 && ch.word_count < 30) {
      issues.push({
        code: "chapter-too-short",
        severity: "warn",
        message: `Chapter ${i + 1} has only ${ch.word_count} words`,
        chapterIndex: i,
      });
    }
  });

  if (language === "en" && grade >= 6) {
    const allContent = chapters.map(c => c.content).join(" ");
    const basicWords = ["good", "nice", "bad", "big", "small", "happy", "sad"];
    const basicCount = basicWords.reduce((sum, w) => {
      const re = new RegExp(`\\b${w}\\b`, "gi");
      return sum + ((allContent.match(re) || []).length);
    }, 0);
    const wordEstimate = allContent.split(/\s+/).length;
    if (wordEstimate > 0 && basicCount / wordEstimate > 0.05) {
      issues.push({
        code: "vocab-too-basic",
        severity: "warn",
        message: `Over 5% of words are basic vocabulary (${basicCount}/${wordEstimate}) for grade ${grade}`,
      });
    }
  }

  const pass = !issues.some(i => i.severity === "error");
  return { pass, issues };
}
