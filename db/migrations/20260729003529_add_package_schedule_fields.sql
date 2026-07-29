-- migrate:up
ALTER TABLE subscription_packages
  ADD COLUMN IF NOT EXISTS valid_days TEXT,
  ADD COLUMN IF NOT EXISTS time_start TEXT,
  ADD COLUMN IF NOT EXISTS time_end TEXT,
  ADD COLUMN IF NOT EXISTS fixed_start_date DATE,
  ADD COLUMN IF NOT EXISTS fixed_end_date DATE,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- migrate:down
ALTER TABLE subscription_packages
  DROP COLUMN IF EXISTS valid_days,
  DROP COLUMN IF EXISTS time_start,
  DROP COLUMN IF EXISTS time_end,
  DROP COLUMN IF EXISTS fixed_start_date,
  DROP COLUMN IF EXISTS fixed_end_date,
  DROP COLUMN IF EXISTS notes;
