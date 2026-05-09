"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface UseReadingProgressResult {
  progress: number;
  currentParagraph: number;
}

function getStorageKey(articleId: string): string {
  return `hw-reader-progress-${articleId}`;
}

function readSavedParagraph(articleId: string): number | null {
  try {
    const raw = localStorage.getItem(getStorageKey(articleId));
    if (raw === null) return null;
    const parsed = parseInt(raw, 10);
    return Number.isNaN(parsed) ? null : parsed;
  } catch {
    return null;
  }
}

function saveParagraph(articleId: string, index: number): void {
  try {
    localStorage.setItem(getStorageKey(articleId), String(index));
  } catch {
    // Silently ignore localStorage errors (e.g. quota exceeded, private mode)
  }
}

export function useReadingProgress(
  articleId: string,
  totalParagraphs: number
): UseReadingProgressResult {
  const [progress, setProgress] = useState(0);
  const [currentParagraph, setCurrentParagraph] = useState(0);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const visibleParagraphsRef = useRef<Set<number>>(new Set());

  // Restore saved position on mount
  useEffect(() => {
    const saved = readSavedParagraph(articleId);
    if (saved !== null && saved >= 0 && saved < totalParagraphs) {
      setCurrentParagraph(saved);
      setProgress(
        totalParagraphs > 0
          ? Math.round(((saved + 1) / totalParagraphs) * 100)
          : 0
      );
    }
  }, [articleId, totalParagraphs]);

  const handleIntersection = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const visible = visibleParagraphsRef.current;

      for (const entry of entries) {
        const indexAttr = entry.target.getAttribute("data-paragraph-index");
        if (indexAttr === null) continue;
        const index = parseInt(indexAttr, 10);
        if (Number.isNaN(index)) continue;

        if (entry.isIntersecting) {
          visible.add(index);
        } else {
          visible.delete(index);
        }
      }

      if (visible.size === 0) return;

      // Current paragraph = the smallest visible index (topmost in viewport)
      const current = Math.min(...visible);
      setCurrentParagraph(current);
      saveParagraph(articleId, current);

      const newProgress =
        totalParagraphs > 0
          ? Math.round(((current + 1) / totalParagraphs) * 100)
          : 0;
      setProgress(newProgress);
    },
    [articleId, totalParagraphs]
  );

  // Setup IntersectionObserver
  useEffect(() => {
    if (totalParagraphs === 0) return;

    observerRef.current = new IntersectionObserver(handleIntersection, {
      root: null,
      rootMargin: "-20% 0px -20% 0px",
      threshold: 0,
    });

    const observer = observerRef.current;

    // Observe all paragraph elements
    const paragraphElements = document.querySelectorAll(
      "[data-paragraph-index]"
    );
    paragraphElements.forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
    };
  }, [totalParagraphs, handleIntersection]);

  // Re-observe when DOM changes (paragraphs rendered)
  useEffect(() => {
    if (!observerRef.current || totalParagraphs === 0) return;

    const observer = observerRef.current;
    const paragraphElements = document.querySelectorAll(
      "[data-paragraph-index]"
    );

    // Clear and re-observe
    observer.disconnect();
    visibleParagraphsRef.current.clear();
    paragraphElements.forEach((el) => observer.observe(el));
  }, [totalParagraphs, articleId]);

  return { progress, currentParagraph };
}
