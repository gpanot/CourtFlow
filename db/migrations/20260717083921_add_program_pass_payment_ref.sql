-- migrate:up
ALTER TABLE class_pass_payments
  ADD COLUMN IF NOT EXISTS payment_ref TEXT UNIQUE;

-- migrate:down
ALTER TABLE class_pass_payments DROP COLUMN IF EXISTS payment_ref;
