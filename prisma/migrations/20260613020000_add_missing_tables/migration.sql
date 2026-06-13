-- CreateTable: player_accounts
CREATE TABLE IF NOT EXISTS "player_accounts" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "image" TEXT,
    "password_hash" TEXT,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "player_accounts_provider_provider_account_id_key"
  ON "player_accounts"("provider", "provider_account_id");
CREATE INDEX IF NOT EXISTS "player_accounts_player_id_idx"
  ON "player_accounts"("player_id");

DO $$ BEGIN
  ALTER TABLE "player_accounts"
    ADD CONSTRAINT "player_accounts_player_id_fkey"
    FOREIGN KEY ("player_id") REFERENCES "players"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable: player_coach_credits
CREATE TABLE IF NOT EXISTS "player_coach_credits" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "package_id" TEXT NOT NULL,
    "total_sessions" INTEGER NOT NULL,
    "used_sessions" INTEGER NOT NULL DEFAULT 0,
    "price_in_cents" INTEGER NOT NULL,
    "payment_ref" TEXT,
    "payment_status" TEXT NOT NULL DEFAULT 'pending',
    "proof_url" TEXT,
    "confirmed_by" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_coach_credits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "player_coach_credits_payment_ref_key"
  ON "player_coach_credits"("payment_ref");
CREATE INDEX IF NOT EXISTS "player_coach_credits_player_id_coach_id_idx"
  ON "player_coach_credits"("player_id", "coach_id");
CREATE INDEX IF NOT EXISTS "player_coach_credits_venue_id_idx"
  ON "player_coach_credits"("venue_id");

DO $$ BEGIN
  ALTER TABLE "player_coach_credits"
    ADD CONSTRAINT "player_coach_credits_player_id_fkey"
    FOREIGN KEY ("player_id") REFERENCES "players"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "player_coach_credits"
    ADD CONSTRAINT "player_coach_credits_coach_id_fkey"
    FOREIGN KEY ("coach_id") REFERENCES "staff_members"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "player_coach_credits"
    ADD CONSTRAINT "player_coach_credits_venue_id_fkey"
    FOREIGN KEY ("venue_id") REFERENCES "venues"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "player_coach_credits"
    ADD CONSTRAINT "player_coach_credits_package_id_fkey"
    FOREIGN KEY ("package_id") REFERENCES "coach_packages"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable: coach_availabilities
CREATE TABLE IF NOT EXISTS "coach_availabilities" (
    "id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "coach_availabilities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "coach_availabilities_coach_id_idx"
  ON "coach_availabilities"("coach_id");

DO $$ BEGIN
  ALTER TABLE "coach_availabilities"
    ADD CONSTRAINT "coach_availabilities_coach_id_fkey"
    FOREIGN KEY ("coach_id") REFERENCES "staff_members"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable: coach_holidays
CREATE TABLE IF NOT EXISTS "coach_holidays" (
    "id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "note" TEXT,

    CONSTRAINT "coach_holidays_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "coach_holidays_coach_id_idx"
  ON "coach_holidays"("coach_id");

DO $$ BEGIN
  ALTER TABLE "coach_holidays"
    ADD CONSTRAINT "coach_holidays_coach_id_fkey"
    FOREIGN KEY ("coach_id") REFERENCES "staff_members"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable: player_custom_prices
CREATE TABLE IF NOT EXISTS "player_custom_prices" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "discount_type" TEXT NOT NULL,
    "custom_fee" INTEGER,
    "discount_pct" INTEGER,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_custom_prices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "player_custom_prices_player_id_staff_id_key"
  ON "player_custom_prices"("player_id", "staff_id");

DO $$ BEGIN
  ALTER TABLE "player_custom_prices"
    ADD CONSTRAINT "player_custom_prices_player_id_fkey"
    FOREIGN KEY ("player_id") REFERENCES "players"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "player_custom_prices"
    ADD CONSTRAINT "player_custom_prices_staff_id_fkey"
    FOREIGN KEY ("staff_id") REFERENCES "staff_members"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable: signup_duplicate_logs
CREATE TABLE IF NOT EXISTS "signup_duplicate_logs" (
    "id" TEXT NOT NULL,
    "new_player_photo_path" TEXT,
    "new_player_name" TEXT,
    "new_player_phone" TEXT,
    "matched_player_id" TEXT NOT NULL,
    "similarity_score" DOUBLE PRECISION,
    "threshold" DOUBLE PRECISION,
    "aws_face_id" TEXT,
    "aws_detail" JSONB,
    "source" TEXT NOT NULL DEFAULT 'unknown',
    "venue_id" TEXT,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signup_duplicate_logs_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "signup_duplicate_logs"
    ADD CONSTRAINT "signup_duplicate_logs_matched_player_id_fkey"
    FOREIGN KEY ("matched_player_id") REFERENCES "players"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "signup_duplicate_logs"
    ADD CONSTRAINT "signup_duplicate_logs_venue_id_fkey"
    FOREIGN KEY ("venue_id") REFERENCES "venues"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
