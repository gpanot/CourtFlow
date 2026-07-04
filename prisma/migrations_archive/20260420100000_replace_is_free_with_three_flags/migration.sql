-- Replace single is_free with three per-component free flags
ALTER TABLE "venue_billing_rates"
  ADD COLUMN "is_free_base"        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "is_free_sub_addon"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "is_free_sepay_addon" BOOLEAN NOT NULL DEFAULT false;

-- Migrate existing is_free=true rows: set all three flags
UPDATE "venue_billing_rates" SET
  "is_free_base"        = "is_free",
  "is_free_sub_addon"   = "is_free",
  "is_free_sepay_addon" = "is_free";

-- Drop the old column
ALTER TABLE "venue_billing_rates" DROP COLUMN "is_free";
