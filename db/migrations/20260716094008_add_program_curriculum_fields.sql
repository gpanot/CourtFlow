-- migrate:up
ALTER TABLE program_pass_types
  ADD COLUMN IF NOT EXISTS level TEXT,
  ADD COLUMN IF NOT EXISTS skill_tags TEXT[],
  ADD COLUMN IF NOT EXISTS prerequisites TEXT,
  ADD COLUMN IF NOT EXISTS age_range TEXT;

ALTER TABLE class_instances
  ADD COLUMN IF NOT EXISTS topic TEXT;

-- migrate:down
ALTER TABLE class_instances DROP COLUMN IF EXISTS topic;
ALTER TABLE program_pass_types
  DROP COLUMN IF EXISTS level,
  DROP COLUMN IF EXISTS skill_tags,
  DROP COLUMN IF EXISTS prerequisites,
  DROP COLUMN IF EXISTS age_range;
