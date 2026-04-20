-- Add isFree flag to venue_billing_rates
ALTER TABLE "venue_billing_rates" ADD COLUMN "is_free" BOOLEAN NOT NULL DEFAULT false;
