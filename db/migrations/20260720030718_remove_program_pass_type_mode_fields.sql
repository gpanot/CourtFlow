-- migrate:up
ALTER TABLE program_pass_types
  DROP COLUMN IF EXISTS pass_mode,
  DROP COLUMN IF EXISTS is_one_time,
  DROP COLUMN IF EXISTS cycle_length_days;

-- migrate:down
ALTER TABLE program_pass_types
  ADD COLUMN IF NOT EXISTS pass_mode         TEXT NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS is_one_time       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cycle_length_days INT NOT NULL DEFAULT 30;
