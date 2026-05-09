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

// Content generation types (used by quality-gate.ts)
export interface GeneratedArticle {
  title: string;
  content: string;
  summary: string;
  word_count: number;
  estimated_minutes: number;
  difficulty: number;
  scene_description: string;
  classical_quote?: {
    original: string;
    pinyin: string;
    translation: string;
  };
}

export interface GeneratedQuestion {
  question_text: string;
  question_type: ReadingQuestionType;
  options: { label: string; text: string }[];
  correct_answer: string;
  difficulty: number;
}

export interface GeneratedIllustration {
  paragraph_index: number;
  scene_description: string;
}
