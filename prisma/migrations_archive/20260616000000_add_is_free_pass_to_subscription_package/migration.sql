-- AlterTable
ALTER TABLE "subscription_packages" ADD COLUMN IF NOT EXISTS "is_free_pass" BOOLEAN NOT NULL DEFAULT false;
