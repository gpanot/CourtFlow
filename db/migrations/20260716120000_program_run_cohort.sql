-- migrate:up

-- 1. Add program_class to CourtBlockType enum
DO $$ BEGIN
  ALTER TYPE "CourtBlockType" ADD VALUE IF NOT EXISTS 'program_class';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Add program_run_id to court_blocks (no FK yet — program_runs table doesn't exist yet).
-- Do NOT add a coach_id column here; coaches are assigned via program_run_court_block_coaches.
ALTER TABLE court_blocks
  ADD COLUMN IF NOT EXISTS program_run_id TEXT;

-- 3. Create program_run_court_block_coaches — single source of truth for coaches on a block.
CREATE TABLE IF NOT EXISTS program_run_court_block_coaches (
  court_block_id TEXT NOT NULL REFERENCES court_blocks(id) ON DELETE CASCADE,
  coach_id       TEXT NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  PRIMARY KEY (court_block_id, coach_id)
);

CREATE INDEX IF NOT EXISTS idx_prcbc_court_block_id ON program_run_court_block_coaches(court_block_id);
CREATE INDEX IF NOT EXISTS idx_prcbc_coach_id       ON program_run_court_block_coaches(coach_id);

-- 4. Create program_runs table.
-- start_date is a plain DATE (local calendar date of first occurrence, no timezone).
-- Allowed status values: 'upcoming' | 'in_progress' | 'completed' | 'cancelled'
-- Day-of-week is derived at runtime from start_date — not stored redundantly.
CREATE TABLE IF NOT EXISTS program_runs (
  id                     TEXT        NOT NULL PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  pass_type_id           TEXT        NOT NULL REFERENCES program_pass_types(id) ON DELETE RESTRICT,
  venue_id               TEXT        NOT NULL REFERENCES venues(id) ON DELETE RESTRICT,
  name                   TEXT        NOT NULL,
  status                 TEXT        NOT NULL DEFAULT 'upcoming',
  start_date             DATE        NOT NULL,
  recurrence_start_hour  INT         NOT NULL,
  recurrence_duration_min INT        NOT NULL,
  recurrence_count       INT,
  recurrence_end_date    DATE,
  max_capacity           INT         NOT NULL DEFAULT 20,
  court_id               TEXT        REFERENCES courts(id) ON DELETE SET NULL,
  note                   TEXT,
  created_by             TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_program_runs_pass_type_id  ON program_runs(pass_type_id);
CREATE INDEX IF NOT EXISTS idx_program_runs_venue_status  ON program_runs(venue_id, status);

-- 5. Add deferred FK from court_blocks.program_run_id → program_runs
ALTER TABLE court_blocks
  ADD CONSTRAINT fk_court_blocks_program_run
    FOREIGN KEY (program_run_id) REFERENCES program_runs(id) ON DELETE SET NULL;

-- 6. Create program_run_coaches — default coaches for a run, copied to per-block rows on schedule generation.
CREATE TABLE IF NOT EXISTS program_run_coaches (
  run_id    TEXT NOT NULL REFERENCES program_runs(id) ON DELETE CASCADE,
  coach_id  TEXT NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  PRIMARY KEY (run_id, coach_id)
);

CREATE INDEX IF NOT EXISTS idx_program_run_coaches_run_id   ON program_run_coaches(run_id);
CREATE INDEX IF NOT EXISTS idx_program_run_coaches_coach_id ON program_run_coaches(coach_id);

-- 7. Link class_passes (ProgramPass) to a specific run
ALTER TABLE class_passes
  ADD COLUMN IF NOT EXISTS program_run_id TEXT REFERENCES program_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_class_passes_program_run_id ON class_passes(program_run_id);

-- 8. Link class_instances (ClassInstance) to a run and its generating CourtBlock;
--    drop the legacy court_id column (now redundant via CourtBlock.courtIds).
ALTER TABLE class_instances
  ADD COLUMN IF NOT EXISTS program_run_id  TEXT REFERENCES program_runs(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS court_block_id  TEXT REFERENCES court_blocks(id)  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_class_instances_program_run_id ON class_instances(program_run_id);
CREATE INDEX IF NOT EXISTS idx_class_instances_court_block_id ON class_instances(court_block_id);

ALTER TABLE class_instances
  DROP COLUMN IF EXISTS court_id;

-- 9. Add description and image_url to program_pass_types
ALTER TABLE program_pass_types
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS image_url   TEXT;

-- 10. Create program_run_waitlist — schema only, promotion logic is Phase 2.
CREATE TABLE IF NOT EXISTS program_run_waitlist (
  id          TEXT        NOT NULL PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  run_id      TEXT        NOT NULL REFERENCES program_runs(id) ON DELETE CASCADE,
  player_id   TEXT        NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status      TEXT        NOT NULL DEFAULT 'waiting',
  promoted_at TIMESTAMPTZ,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_program_run_waitlist_run_id    ON program_run_waitlist(run_id);
CREATE INDEX IF NOT EXISTS idx_program_run_waitlist_player_id ON program_run_waitlist(player_id);


-- migrate:down

DROP TABLE IF EXISTS program_run_waitlist;

ALTER TABLE program_pass_types
  DROP COLUMN IF EXISTS description,
  DROP COLUMN IF EXISTS image_url;

ALTER TABLE class_instances
  DROP COLUMN IF EXISTS court_block_id,
  DROP COLUMN IF EXISTS program_run_id;

ALTER TABLE class_passes
  DROP COLUMN IF EXISTS program_run_id;

DROP TABLE IF EXISTS program_run_coaches;

ALTER TABLE court_blocks
  DROP CONSTRAINT IF EXISTS fk_court_blocks_program_run;

DROP TABLE IF EXISTS program_runs;

DROP TABLE IF EXISTS program_run_court_block_coaches;

ALTER TABLE court_blocks
  DROP COLUMN IF EXISTS program_run_id;

-- Note: Postgres does not support removing enum values added with ADD VALUE.
-- The 'program_class' CourtBlockType value cannot be rolled back automatically.
