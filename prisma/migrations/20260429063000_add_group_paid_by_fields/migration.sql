ALTER TABLE "pending_payments"
ADD COLUMN "group_paid_by_payment_id" TEXT,
ADD COLUMN "group_paid_by_name" TEXT;

CREATE INDEX "pending_payments_group_paid_by_payment_id_idx"
ON "pending_payments"("group_paid_by_payment_id");
