-- migrate:up
ALTER TABLE membership_payments
  ADD COLUMN IF NOT EXISTS payment_type TEXT NOT NULL DEFAULT 'recurring';

-- migrate:down
ALTER TABLE membership_payments
  DROP COLUMN IF EXISTS payment_type;
