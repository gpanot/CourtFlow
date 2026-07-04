-- Add client-submitted payment proof fields to manual_billing_invoices
ALTER TABLE "manual_billing_invoices"
  ADD COLUMN IF NOT EXISTS "proof_url"          TEXT,
  ADD COLUMN IF NOT EXISTS "proof_submitted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "proof_method"       TEXT,
  ADD COLUMN IF NOT EXISTS "proof_ref"          TEXT;
