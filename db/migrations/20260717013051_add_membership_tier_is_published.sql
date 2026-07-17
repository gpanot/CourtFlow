-- migrate:up
ALTER TABLE membership_tiers
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT true;

-- migrate:down
ALTER TABLE membership_tiers
  DROP COLUMN IF EXISTS is_published;
