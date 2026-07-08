-- migrate:up
ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "legal_company_name" TEXT,
  ADD COLUMN IF NOT EXISTS "registration_number" TEXT,
  ADD COLUMN IF NOT EXISTS "tax_id" TEXT,
  ADD COLUMN IF NOT EXISTS "registered_address" TEXT;

-- migrate:down
ALTER TABLE "organizations"
  DROP COLUMN IF EXISTS "legal_company_name",
  DROP COLUMN IF EXISTS "registration_number",
  DROP COLUMN IF EXISTS "tax_id",
  DROP COLUMN IF EXISTS "registered_address";
