-- Expand reading_questions.question_type CHECK constraint to include
-- evaluate and synthesize types (Bloom's taxonomy levels).
--
-- Background: The original constraint only allowed 5 types
-- (main_idea, detail, inference, vocabulary, sequence). The content
-- generator now also produces "evaluate" and "synthesize" question types
-- from the LLM. Without this migration, INSERT fails silently and
-- articles end up with zero questions — no quiz, no completion recorded.

ALTER TABLE reading_questions
  DROP CONSTRAINT IF EXISTS reading_questions_question_type_check;

ALTER TABLE reading_questions
  ADD CONSTRAINT reading_questions_question_type_check
  CHECK (question_type IN (
    'main_idea', 'detail', 'inference', 'vocabulary', 'sequence',
    'evaluate', 'synthesize'
  ));
