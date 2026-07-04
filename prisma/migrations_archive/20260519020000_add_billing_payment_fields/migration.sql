-- Add payment gateway toggle to billing config
ALTER TABLE "billing_config" ADD COLUMN IF NOT EXISTS "payment_gateway" TEXT NOT NULL DEFAULT 'payos';

-- Add paid_amount, comment, and payos_order_code to billing invoices
ALTER TABLE "billing_invoices" ADD COLUMN IF NOT EXISTS "paid_amount" INTEGER;
ALTER TABLE "billing_invoices" ADD COLUMN IF NOT EXISTS "comment" TEXT;
ALTER TABLE "billing_invoices" ADD COLUMN IF NOT EXISTS "payos_order_code" TEXT;

-- Unique constraint on payos_order_code (only non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS "billing_invoices_payos_order_code_key" ON "billing_invoices"("payos_order_code");
