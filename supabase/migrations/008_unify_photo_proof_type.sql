UPDATE attachments
SET type = 'photo'
WHERE type = 'screenshot';

UPDATE homeworks
SET required_checkpoint_type = 'photo'
WHERE required_checkpoint_type = 'screenshot';

UPDATE check_ins
SET proof_type = 'photo'
WHERE proof_type = 'screenshot';

ALTER TABLE attachments DROP CONSTRAINT IF EXISTS attachments_type_check;
ALTER TABLE attachments
  ADD CONSTRAINT attachments_type_check
  CHECK (type IN ('photo', 'audio'));

ALTER TABLE check_ins DROP CONSTRAINT IF EXISTS check_ins_proof_type_check;
ALTER TABLE check_ins
  ADD CONSTRAINT check_ins_proof_type_check
  CHECK (proof_type IN ('photo', 'audio') OR proof_type IS NULL);
