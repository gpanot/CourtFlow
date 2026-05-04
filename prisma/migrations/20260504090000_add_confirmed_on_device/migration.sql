-- AlterTable (idempotent: column may already exist if added manually before migration ran)
ALTER TABLE "pending_payments" ADD COLUMN IF NOT EXISTS "confirmed_on_device" TEXT;
