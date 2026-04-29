ALTER TABLE homeworks
ADD COLUMN IF NOT EXISTS platform_binding_platform TEXT,
ADD COLUMN IF NOT EXISTS platform_binding_source_ref TEXT;
