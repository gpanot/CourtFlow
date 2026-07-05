-- migrate:up

-- Add expired_hold to the BookingStatus enum so we can soft-record payment
-- hold expirations instead of hard-deleting them.
DO $$ BEGIN
  ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'expired_hold';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add a cancelled_at column to open_play_registrations for expired-hold records
-- (bookings already have cancelled_at).
ALTER TABLE "open_play_registrations"
  ADD COLUMN IF NOT EXISTS "expired_at" TIMESTAMPTZ;

-- migrate:down

-- Note: Postgres does not support removing enum values.
-- Down migration only removes the expired_at column added above.
ALTER TABLE "open_play_registrations"
  DROP COLUMN IF EXISTS "expired_at";
