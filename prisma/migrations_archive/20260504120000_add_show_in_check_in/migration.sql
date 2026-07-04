ALTER TABLE "subscription_packages" ADD COLUMN IF NOT EXISTS "show_in_check_in" BOOLEAN NOT NULL DEFAULT true;
