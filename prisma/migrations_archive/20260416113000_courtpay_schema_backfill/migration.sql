-- CourtPay schema backfill.
-- This migration is intentionally idempotent because production was hotfixed manually.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SubscriptionStatus') THEN
    CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'exhausted', 'expired', 'cancelled');
  END IF;
END
$$;

ALTER TABLE "pending_payments"
  ADD COLUMN IF NOT EXISTS "check_in_player_id" TEXT,
  ADD COLUMN IF NOT EXISTS "payment_ref" TEXT;

ALTER TABLE "pending_payments"
  ALTER COLUMN "session_id" DROP NOT NULL,
  ALTER COLUMN "player_id" DROP NOT NULL;

CREATE TABLE IF NOT EXISTS "check_in_players" (
  "id" TEXT NOT NULL,
  "venue_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "gender" TEXT,
  "skill_level" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "check_in_players_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "subscription_packages" (
  "id" TEXT NOT NULL,
  "venue_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sessions" INTEGER,
  "duration_days" INTEGER NOT NULL,
  "price" INTEGER NOT NULL,
  "perks" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "subscription_packages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "player_subscriptions" (
  "id" TEXT NOT NULL,
  "player_id" TEXT NOT NULL,
  "package_id" TEXT NOT NULL,
  "venue_id" TEXT NOT NULL,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'active',
  "sessions_remaining" INTEGER,
  "activated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "payment_ref" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "player_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "subscription_usages" (
  "id" TEXT NOT NULL,
  "subscription_id" TEXT NOT NULL,
  "checked_in_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subscription_usages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "check_in_records" (
  "id" TEXT NOT NULL,
  "player_id" TEXT NOT NULL,
  "venue_id" TEXT NOT NULL,
  "checked_in_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "payment_id" TEXT,
  "source" TEXT NOT NULL,
  CONSTRAINT "check_in_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "check_in_players_venue_id_idx" ON "check_in_players"("venue_id");
CREATE UNIQUE INDEX IF NOT EXISTS "check_in_players_phone_venue_id_key" ON "check_in_players"("phone", "venue_id");
CREATE INDEX IF NOT EXISTS "subscription_packages_venue_id_is_active_idx" ON "subscription_packages"("venue_id", "is_active");
CREATE INDEX IF NOT EXISTS "player_subscriptions_player_id_status_idx" ON "player_subscriptions"("player_id", "status");
CREATE INDEX IF NOT EXISTS "player_subscriptions_venue_id_status_idx" ON "player_subscriptions"("venue_id", "status");
CREATE INDEX IF NOT EXISTS "subscription_usages_subscription_id_idx" ON "subscription_usages"("subscription_id");
CREATE INDEX IF NOT EXISTS "check_in_records_venue_id_checked_in_at_idx" ON "check_in_records"("venue_id", "checked_in_at");
CREATE INDEX IF NOT EXISTS "check_in_records_player_id_idx" ON "check_in_records"("player_id");
CREATE UNIQUE INDEX IF NOT EXISTS "pending_payments_payment_ref_key" ON "pending_payments"("payment_ref");
CREATE INDEX IF NOT EXISTS "pending_payments_payment_ref_idx" ON "pending_payments"("payment_ref");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pending_payments_player_id_fkey') THEN
    ALTER TABLE "pending_payments" DROP CONSTRAINT "pending_payments_player_id_fkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pending_payments_session_id_fkey') THEN
    ALTER TABLE "pending_payments" DROP CONSTRAINT "pending_payments_session_id_fkey";
  END IF;

  ALTER TABLE "pending_payments"
    ADD CONSTRAINT "pending_payments_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "sessions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

  ALTER TABLE "pending_payments"
    ADD CONSTRAINT "pending_payments_player_id_fkey"
    FOREIGN KEY ("player_id") REFERENCES "players"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pending_payments_check_in_player_id_fkey') THEN
    ALTER TABLE "pending_payments"
      ADD CONSTRAINT "pending_payments_check_in_player_id_fkey"
      FOREIGN KEY ("check_in_player_id") REFERENCES "check_in_players"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_in_players_venue_id_fkey') THEN
    ALTER TABLE "check_in_players"
      ADD CONSTRAINT "check_in_players_venue_id_fkey"
      FOREIGN KEY ("venue_id") REFERENCES "venues"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscription_packages_venue_id_fkey') THEN
    ALTER TABLE "subscription_packages"
      ADD CONSTRAINT "subscription_packages_venue_id_fkey"
      FOREIGN KEY ("venue_id") REFERENCES "venues"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'player_subscriptions_player_id_fkey') THEN
    ALTER TABLE "player_subscriptions"
      ADD CONSTRAINT "player_subscriptions_player_id_fkey"
      FOREIGN KEY ("player_id") REFERENCES "check_in_players"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'player_subscriptions_package_id_fkey') THEN
    ALTER TABLE "player_subscriptions"
      ADD CONSTRAINT "player_subscriptions_package_id_fkey"
      FOREIGN KEY ("package_id") REFERENCES "subscription_packages"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscription_usages_subscription_id_fkey') THEN
    ALTER TABLE "subscription_usages"
      ADD CONSTRAINT "subscription_usages_subscription_id_fkey"
      FOREIGN KEY ("subscription_id") REFERENCES "player_subscriptions"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_in_records_player_id_fkey') THEN
    ALTER TABLE "check_in_records"
      ADD CONSTRAINT "check_in_records_player_id_fkey"
      FOREIGN KEY ("player_id") REFERENCES "check_in_players"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_in_records_venue_id_fkey') THEN
    ALTER TABLE "check_in_records"
      ADD CONSTRAINT "check_in_records_venue_id_fkey"
      FOREIGN KEY ("venue_id") REFERENCES "venues"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;
