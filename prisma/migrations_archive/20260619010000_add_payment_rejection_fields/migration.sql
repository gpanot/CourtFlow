-- Add payment rejection fields to Booking, OpenPlayRegistration, and CoachLesson

ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "rejected_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rejected_by" TEXT,
  ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT;

ALTER TABLE "open_play_registrations"
  ADD COLUMN IF NOT EXISTS "rejected_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rejected_by" TEXT,
  ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT;

ALTER TABLE "coach_lessons"
  ADD COLUMN IF NOT EXISTS "rejected_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rejected_by" TEXT,
  ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT;
