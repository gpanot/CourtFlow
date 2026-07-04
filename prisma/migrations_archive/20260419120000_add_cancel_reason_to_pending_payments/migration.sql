-- AlterTable
ALTER TABLE "pending_payments" ADD COLUMN "cancel_reason" TEXT;
ALTER TABLE "pending_payments" ADD COLUMN "cancelled_at" TIMESTAMP(3);
