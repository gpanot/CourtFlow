-- migrate:up
ALTER TABLE program_runs
  ADD COLUMN IF NOT EXISTS court_ids TEXT[] NOT NULL DEFAULT '{}';

-- Back-fill from the existing single court_id where set
UPDATE program_runs
SET court_ids = ARRAY[court_id]
WHERE court_id IS NOT NULL AND court_ids = '{}';

-- migrate:down
ALTER TABLE program_runs DROP COLUMN IF EXISTS court_ids;
