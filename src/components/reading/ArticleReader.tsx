"use client";

import { useState, useCallback, useRef, useEffect } from "react";

export interface ArticleReaderArticle {
  id: string;
  title: string;
  content: string;
  gradeLevel: number;
  category: string;
  wordCount: number;
  estimatedMinutes: number;
}

interface ArticleReaderProps {
  article: ArticleReaderArticle;
  onStartQuiz: () => void;
}

export function ArticleReader({ article, onStartQuiz }: ArticleReaderProps) {
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const [ttsPaused, setTtsPaused] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(true);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && !window.speechSynthesis) {
      setTtsSupported(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handleTTS = useCallback(() => {
    if (!window.speechSynthesis) return;

    if (ttsPlaying && !ttsPaused) {
      window.speechSynthesis.pause();
      setTtsPaused(true);
      return;
    }

    if (ttsPaused) {
      window.speechSynthesis.resume();
      setTtsPaused(false);
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(article.content);
    utterance.lang = "en-US";
    utterance.rate = article.gradeLevel <= 3 ? 0.8 : 1.0;
    utterance.onend = () => {
      setTtsPlaying(false);
      setTtsPaused(false);
    };
    utterance.onerror = () => {
      setTtsPlaying(false);
      setTtsPaused(false);
    };
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setTtsPlaying(true);
    setTtsPaused(false);
  }, [article.content, article.gradeLevel, ttsPlaying, ttsPaused]);

  const isLowerGrade = article.gradeLevel <= 3;

  return (
    <div className="flex flex-col gap-6">
      {/* Title area */}
      <div className="space-y-3">
        <h1 className="text-2xl font-bold text-forest-800">
          {article.title}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
            {article.category}
          </span>
          <span className="rounded-full bg-forest-100 px-3 py-1 text-sm font-medium text-forest-600">
            G{article.gradeLevel}
          </span>
          <span className="text-sm text-forest-400">
            {article.wordCount} 词 · 预计 {article.estimatedMinutes} 分钟
          </span>
        </div>
      </div>

      {/* TTS button for lower grades */}
      {isLowerGrade && ttsSupported && (
        <button
          type="button"
          onClick={handleTTS}
          className="inline-flex w-fit items-center gap-2 rounded-full bg-forest-100 px-4 py-2 text-sm font-medium text-forest-700 transition hover:bg-forest-200 active:scale-95"
        >
          {ttsPlaying && !ttsPaused ? "⏸️ 暂停" : "🔊 朗读"}
        </button>
      )}

      {/* Content area */}
      <div className="max-w-2xl rounded-2xl bg-white p-6 shadow-sm ring-1 ring-forest-100">
        <div
          className={`whitespace-pre-wrap text-forest-700 ${
            isLowerGrade ? "text-lg leading-relaxed" : "text-base leading-relaxed"
          }`}
        >
          {article.content}
        </div>
      </div>

      {/* Bottom action bar */}
      <div className="sticky bottom-0 -mx-4 bg-white/95 px-4 py-4 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] backdrop-blur sm:static sm:mx-0 sm:bg-transparent sm:p-0 sm:shadow-none">
        <button
          type="button"
          onClick={onStartQuiz}
          className="w-full rounded-xl bg-primary px-6 py-4 text-lg font-semibold text-white shadow-md transition hover:bg-primary-dark active:scale-[0.98] sm:w-auto"
        >
          {"📝 开始答题"}
        </button>
      </div>
    </div>
  );
}
