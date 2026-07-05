-- migrate:up

DO $$ BEGIN
  ALTER TYPE "CourtBlockType" ADD VALUE IF NOT EXISTS 'alobo';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- migrate:down

-- Postgres does not support removing enum values.
