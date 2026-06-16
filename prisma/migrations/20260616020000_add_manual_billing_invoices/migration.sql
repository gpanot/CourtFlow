-- CreateTable
CREATE TABLE IF NOT EXISTS "manual_billing_invoices" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "pdf_url" TEXT,
    "paid_at" TIMESTAMP(3),
    "paid_method" TEXT,
    "paid_ref" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manual_billing_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "manual_billing_invoices_venue_id_status_idx" ON "manual_billing_invoices"("venue_id", "status");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'manual_billing_invoices_venue_id_fkey'
  ) THEN
    ALTER TABLE "manual_billing_invoices" ADD CONSTRAINT "manual_billing_invoices_venue_id_fkey"
      FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
