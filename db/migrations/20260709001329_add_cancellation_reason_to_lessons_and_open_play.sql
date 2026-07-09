-- migrate:up

ALTER TABLE coach_lessons
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

ALTER TABLE open_play_registrations
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- migrate:down

ALTER TABLE coach_lessons
  DROP COLUMN IF EXISTS cancellation_reason;

ALTER TABLE open_play_registrations
  DROP COLUMN IF EXISTS cancellation_reason;
