-- migrate:up
ALTER TABLE program_pass_types
  ADD COLUMN IF NOT EXISTS pass_mode   TEXT    NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS is_one_time BOOLEAN NOT NULL DEFAULT false;
-- Allowed pass_mode values: 'monthly' | 'days_30' | 'days_45' | 'days_60' | 'days_90'

-- migrate:down
ALTER TABLE program_pass_types
  DROP COLUMN IF EXISTS pass_mode,
  DROP COLUMN IF EXISTS is_one_time;
