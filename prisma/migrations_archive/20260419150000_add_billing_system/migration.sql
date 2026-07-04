-- AlterTable
ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "billing_status" TEXT NOT NULL DEFAULT 'active';

-- CreateTable
CREATE TABLE IF NOT EXISTS "billing_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "bank_bin" TEXT NOT NULL DEFAULT '',
    "bank_account" TEXT NOT NULL DEFAULT '',
    "bank_owner" TEXT NOT NULL DEFAULT '',
    "default_base_rate" INTEGER NOT NULL DEFAULT 5000,
    "default_sub_addon" INTEGER NOT NULL DEFAULT 1000,
    "default_sepay_addon" INTEGER NOT NULL DEFAULT 1000,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "venue_billing_rates" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "base_rate_per_checkin" INTEGER NOT NULL DEFAULT 5000,
    "subscription_addon" INTEGER NOT NULL DEFAULT 1000,
    "sepay_addon" INTEGER NOT NULL DEFAULT 1000,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venue_billing_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "billing_invoices" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "week_start_date" TIMESTAMP(3) NOT NULL,
    "week_end_date" TIMESTAMP(3) NOT NULL,
    "total_checkins" INTEGER NOT NULL DEFAULT 0,
    "subscription_checkins" INTEGER NOT NULL DEFAULT 0,
    "sepay_checkins" INTEGER NOT NULL DEFAULT 0,
    "base_amount" INTEGER NOT NULL DEFAULT 0,
    "subscription_amount" INTEGER NOT NULL DEFAULT 0,
    "sepay_amount" INTEGER NOT NULL DEFAULT 0,
    "total_amount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payment_ref" TEXT,
    "paid_at" TIMESTAMP(3),
    "confirmed_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "billing_line_items" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "check_in_record_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "checked_in_at" TIMESTAMP(3) NOT NULL,
    "base_rate" INTEGER NOT NULL,
    "subscription_addon" INTEGER NOT NULL DEFAULT 0,
    "sepay_addon" INTEGER NOT NULL DEFAULT 0,
    "line_total" INTEGER NOT NULL,

    CONSTRAINT "billing_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "venue_billing_rates_venue_id_key" ON "venue_billing_rates"("venue_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "billing_invoices_payment_ref_key" ON "billing_invoices"("payment_ref");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "billing_invoices_venue_id_week_start_date_key" ON "billing_invoices"("venue_id", "week_start_date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "billing_invoices_venue_id_status_idx" ON "billing_invoices"("venue_id", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "billing_line_items_invoice_id_idx" ON "billing_line_items"("invoice_id");

-- AddForeignKey
ALTER TABLE "venue_billing_rates" ADD CONSTRAINT "venue_billing_rates_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_line_items" ADD CONSTRAINT "billing_line_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "billing_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
