-- migrate:up
ALTER TABLE membership_tiers
  ADD COLUMN IF NOT EXISTS structured_perks JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS initiation_fee_value INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS minimum_commitment_cycles INTEGER;

-- migrate:down
ALTER TABLE membership_tiers
  DROP COLUMN IF EXISTS structured_perks,
  DROP COLUMN IF EXISTS initiation_fee_value,
  DROP COLUMN IF EXISTS minimum_commitment_cycles;
