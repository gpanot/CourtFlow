-- Add monthly subscription end date and status fields to venue_billing_rates
ALTER TABLE "venue_billing_rates" ADD COLUMN "monthly_end_date" TIMESTAMP(3);
ALTER TABLE "venue_billing_rates" ADD COLUMN "monthly_status" TEXT NOT NULL DEFAULT 'inactive';
