-- Add google_event_id to coach_lessons for Calendar event deletion on cancel
ALTER TABLE "coach_lessons"
  ADD COLUMN IF NOT EXISTS "google_event_id" TEXT;
