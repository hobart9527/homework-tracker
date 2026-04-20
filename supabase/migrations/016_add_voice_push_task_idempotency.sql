ALTER TABLE voice_push_tasks
ADD CONSTRAINT voice_push_tasks_attachment_id_key UNIQUE (attachment_id);
