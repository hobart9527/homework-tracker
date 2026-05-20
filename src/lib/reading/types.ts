// Reading Feature Types
// Manual type definitions for the English graded reading system.
// These complement the auto-generated Database types in src/lib/supabase/types.ts.
export type ReadingCategory =
  | "时事" | "历史" | "科学" | "人物" | "自然" | "文化"
  | "news" | "history" | "science" | "biography" | "nature" | "culture";

export type ReadingQuestionType = "main_idea" | "detail" | "inference" | "vocabulary" | "sequence";

export type ReadingAssignmentStatus = "recommended" | "in_progress" | "completed";

export type ReadingArticleStatus = "draft" | "published";

export interface ReadingArticle {
  id: string;
  topic_key: string;
  title: string;
  content: string;
  source: string;
  source_url: string | null;
  category: ReadingCategory | string;
  grade_level: number;
  word_count: number;
  estimated_minutes: number;
  difficulty: number;
  status: ReadingArticleStatus;
  created_at: string;
}

export interface WordCountRange {
  min: number;
  max: number;
}

export interface ReadingQuestion {
  id: string;
  article_id: string;
  question_text: string;
  question_type: ReadingQuestionType;
  options: { label: string; text: string }[];
  correct_answer: string;
  difficulty: number;
  order_index: number;
}

export interface ReadingAssignment {
  id: string;
  child_id: string;
  article_id: string;
  status: ReadingAssignmentStatus;
  assigned_by: string | null;
  assigned_date: string;
  completed_at: string | null;
}

export interface ReadingQuizAnswer {
  question_id: string;
  selected: string;
  correct: boolean;
}

export interface ReadingQuizAttempt {
  id: string;
  child_id: string;
  article_id: string;
  assignment_id: string | null;
  answers: ReadingQuizAnswer[];
  score: number;
  total_questions: number;
  time_spent_seconds: number;
  created_at: string;
}

import type { Database } from "@/lib/supabase/types";

// Supabase-derived type aliases
export type ReadingArticleRow = Database["public"]["Tables"]["reading_articles"]["Row"];
export type ReadingQuestionRow = Database["public"]["Tables"]["reading_questions"]["Row"];
export type ReadingAssignmentRow = Database["public"]["Tables"]["reading_assignments"]["Row"];
export type ReadingQuizAttemptRow = Database["public"]["Tables"]["reading_quiz_attempts"]["Row"];

// Content generation types (used by content-generator.ts, quality-gate.ts,
// ib-criteria-gate.ts, factual-gate.ts)
export interface GeneratedArticle {
  title: string;
  content: string;
  summary: string;
  word_count: number;
  estimated_minutes: number;
  difficulty: number; // 1-5, LLM self-rating; cross-checked by quality-gate
  scene_description: string; // single sentence, used for cover image generation
  // IB MYP — language-agnostic fields (Phase 1: populated by content-generator prompts)
  genre?: "narrative" | "informative" | "opinion" | "literary" | "记叙文" | "说明文" | "议论文" | "文学散文";
  // English-only IB fields
  author_purpose?: "to inform" | "to entertain" | "to persuade" | "to explain";
  // Chinese-only IB fields
  cultural_connection?: string; // one-sentence description of cultural relevance point
  // Chinese-only: classical quote (成语/古诗词/名言)
  classical_quote?: {
    original: string;
    pinyin: string;
    translation: string;
  };
  // Factual accuracy — populated when sourceText is provided (Tier 1/2)
  // LLM declares which key facts from sourceText are preserved in the article
  factual_accuracy?: {
    source_facts_declared: string[]; // key facts extracted from sourceText
    facts_preserved_count: number;    // how many appear in article.content
  };
}

export interface GeneratedQuestion {
  question_text: string;
  question_type: ReadingQuestionType;
  options: { label: string; text: string }[];
  correct_answer: string;
  difficulty: number;
  hint?: string;
  explanation?: string;
}

export interface GeneratedIllustration {
  paragraph_index: number;
  scene_description: string;
}
