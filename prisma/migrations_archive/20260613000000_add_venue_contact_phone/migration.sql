-- Venues: add slug
ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "slug" TEXT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'venues_slug_key') THEN
    CREATE UNIQUE INDEX "venues_slug_key" ON "venues"("slug");
  END IF;
END $$;

-- Venues: add portal_enabled
ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "portal_enabled" BOOLEAN NOT NULL DEFAULT false;

-- Venues: add contact_phone
ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "contact_phone" TEXT;

-- Bookings: add payment fields
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "payment_status" TEXT;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "payment_proof_url" TEXT;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "hold_expires_at" TIMESTAMP(3);
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "payment_ref" TEXT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'bookings_payment_ref_key') THEN
    CREATE UNIQUE INDEX "bookings_payment_ref_key" ON "bookings"("payment_ref");
  END IF;
END $$;

-- CoachLessons: add missing payment tracking fields
ALTER TABLE "coach_lessons" ADD COLUMN IF NOT EXISTS "payment_status" TEXT NOT NULL DEFAULT 'UNPAID';
ALTER TABLE "coach_lessons" ADD COLUMN IF NOT EXISTS "payment_method" TEXT;
ALTER TABLE "coach_lessons" ADD COLUMN IF NOT EXISTS "payment_note" TEXT;
ALTER TABLE "coach_lessons" ADD COLUMN IF NOT EXISTS "payment_ref" TEXT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'coach_lessons_payment_ref_key') THEN
    CREATE UNIQUE INDEX "coach_lessons_payment_ref_key" ON "coach_lessons"("payment_ref");
  END IF;
END $$;

-- Players: add email + password_hash for credentials auth
ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "password_hash" TEXT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'players_email_key') THEN
    CREATE UNIQUE INDEX "players_email_key" ON "players"("email");
  END IF;
END $$;
