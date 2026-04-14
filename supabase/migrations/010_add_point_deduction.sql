-- Add point_deduction column to homeworks table
-- This allows setting a penalty for incomplete homework after cutoff time
ALTER TABLE homeworks ADD COLUMN IF NOT EXISTS point_deduction INTEGER NOT NULL DEFAULT 0;