-- Add monthly billing model support to venue_billing_rates
ALTER TABLE "venue_billing_rates"
  ADD COLUMN IF NOT EXISTS "billing_model" TEXT NOT NULL DEFAULT 'per_payment',
  ADD COLUMN IF NOT EXISTS "monthly_rate" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "monthly_period_start" TIMESTAMP(3);

-- Add invoice_type to billing_invoices to distinguish weekly vs monthly invoices
ALTER TABLE "billing_invoices"
  ADD COLUMN IF NOT EXISTS "invoice_type" TEXT NOT NULL DEFAULT 'weekly';
