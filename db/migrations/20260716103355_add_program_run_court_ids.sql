-- migrate:up
-- Defensive: this migration may run before or after the program_runs CREATE TABLE migration
-- depending on dbmate timestamp ordering in fresh environments.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'program_runs'
  ) THEN
    ALTER TABLE program_runs ADD COLUMN IF NOT EXISTS court_ids TEXT[] NOT NULL DEFAULT '{}';

    UPDATE program_runs
    SET court_ids = ARRAY[court_id]
    WHERE court_id IS NOT NULL AND court_ids = '{}';
  END IF;
END $$;

-- migrate:down
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'program_runs'
  ) THEN
    ALTER TABLE program_runs DROP COLUMN IF EXISTS court_ids;
  END IF;
END $$;
