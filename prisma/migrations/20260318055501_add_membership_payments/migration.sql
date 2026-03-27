-- CreateEnum
CREATE TYPE "MembershipPaymentStatus" AS ENUM ('UNPAID', 'PAID', 'OVERDUE');

-- CreateTable
CREATE TABLE "membership_payments" (
    "id" TEXT NOT NULL,
    "membership_id" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "amount_in_cents" INTEGER NOT NULL,
    "status" "MembershipPaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "paid_at" TIMESTAMP(3),
    "payment_method" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "membership_payments_membership_id_idx" ON "membership_payments"("membership_id");

-- CreateIndex
CREATE INDEX "membership_payments_status_idx" ON "membership_payments"("status");

-- AddForeignKey
ALTER TABLE "membership_payments" ADD CONSTRAINT "membership_payments_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
