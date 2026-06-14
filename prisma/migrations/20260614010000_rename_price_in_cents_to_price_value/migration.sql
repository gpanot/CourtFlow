-- Rename misleading *InCents columns to *Value (amounts are whole VND, not cents)

ALTER TABLE "membership_tiers" RENAME COLUMN "price_in_cents" TO "price_value";
ALTER TABLE "membership_payments" RENAME COLUMN "amount_in_cents" TO "amount_value";
ALTER TABLE "bookings" RENAME COLUMN "price_in_cents" TO "price_value";
ALTER TABLE "coach_packages" RENAME COLUMN "price_in_cents" TO "price_value";
ALTER TABLE "coach_lessons" RENAME COLUMN "price_in_cents" TO "price_value";

DO $$ BEGIN
  ALTER TABLE "player_coach_credits" RENAME COLUMN "price_in_cents" TO "price_value";
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_column THEN NULL;
END $$;
