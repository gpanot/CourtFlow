-- migrate:up
ALTER TABLE "company_accounts"
  RENAME COLUMN "fixed_discount_amount" TO "fixed_discount_percent";

ALTER TABLE "company_accounts"
  ALTER COLUMN "fixed_discount_percent" SET DEFAULT 0;

ALTER TABLE "company_accounts"
  ADD CONSTRAINT "company_accounts_fixed_discount_percent_check"
  CHECK ("fixed_discount_percent" >= 0 AND "fixed_discount_percent" <= 100);


-- migrate:down
ALTER TABLE "company_accounts"
  DROP CONSTRAINT IF EXISTS "company_accounts_fixed_discount_percent_check";

ALTER TABLE "company_accounts"
  RENAME COLUMN "fixed_discount_percent" TO "fixed_discount_amount";

ALTER TABLE "company_accounts"
  ALTER COLUMN "fixed_discount_amount" SET DEFAULT 0;

