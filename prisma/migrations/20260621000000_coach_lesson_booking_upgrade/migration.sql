-- Coach Lesson Booking Upgrade
-- Idempotent migration: safe to re-run

-- 1. Add pending_approval to CoachLessonStatus enum
DO $$ BEGIN
  ALTER TYPE "CoachLessonStatus" ADD VALUE IF NOT EXISTS 'pending_approval';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. StaffMember: add Google Calendar and credit validity fields
ALTER TABLE "staff_members"
  ADD COLUMN IF NOT EXISTS "google_refresh_token" TEXT,
  ADD COLUMN IF NOT EXISTS "google_calendar_id" TEXT,
  ADD COLUMN IF NOT EXISTS "calendar_sync_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "credit_package_validity_days" INTEGER NOT NULL DEFAULT 90;

-- 3. Player: add coach_staff_id link
ALTER TABLE "players"
  ADD COLUMN IF NOT EXISTS "coach_staff_id" TEXT;

CREATE INDEX IF NOT EXISTS "players_coach_staff_id_idx" ON "players"("coach_staff_id");

ALTER TABLE "players"
  DROP CONSTRAINT IF EXISTS "players_coach_staff_id_fkey";

ALTER TABLE "players"
  ADD CONSTRAINT "players_coach_staff_id_fkey"
  FOREIGN KEY ("coach_staff_id") REFERENCES "staff_members"("id") ON DELETE SET NULL;

-- 4. EmailLog: add recipient_role column
ALTER TABLE "email_logs"
  ADD COLUMN IF NOT EXISTS "recipient_role" TEXT NOT NULL DEFAULT 'student';

-- 5. CreditTransaction table
CREATE TABLE IF NOT EXISTS "credit_transactions" (
  "id"         TEXT NOT NULL,
  "credit_id"  TEXT NOT NULL,
  "lesson_id"  TEXT,
  "amount"     INTEGER NOT NULL,
  "reason"     TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "credit_transactions_credit_id_idx" ON "credit_transactions"("credit_id");

ALTER TABLE "credit_transactions"
  DROP CONSTRAINT IF EXISTS "credit_transactions_credit_id_fkey";

ALTER TABLE "credit_transactions"
  ADD CONSTRAINT "credit_transactions_credit_id_fkey"
  FOREIGN KEY ("credit_id") REFERENCES "player_coach_credits"("id") ON DELETE CASCADE;
