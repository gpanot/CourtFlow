-- AddColumn: discount_pct to subscription_packages
ALTER TABLE "subscription_packages" ADD COLUMN IF NOT EXISTS "discount_pct" INTEGER;

-- AddColumn: is_best_choice to subscription_packages
ALTER TABLE "subscription_packages" ADD COLUMN IF NOT EXISTS "is_best_choice" BOOLEAN NOT NULL DEFAULT false;
