-- migrate:up
ALTER TABLE class_pass_payments
  ADD COLUMN IF NOT EXISTS invoice_number TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS invoiced_at    TIMESTAMP(3) WITHOUT TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_class_pass_payments_invoice_number
  ON class_pass_payments (invoice_number)
  WHERE invoice_number IS NOT NULL;

-- migrate:down
DROP INDEX IF EXISTS idx_class_pass_payments_invoice_number;
ALTER TABLE class_pass_payments
  DROP COLUMN IF EXISTS invoiced_at,
  DROP COLUMN IF EXISTS invoice_number;
