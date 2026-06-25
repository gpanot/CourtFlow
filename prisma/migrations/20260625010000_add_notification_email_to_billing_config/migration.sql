ALTER TABLE "billing_config"
  ADD COLUMN IF NOT EXISTS "notification_email" TEXT;
