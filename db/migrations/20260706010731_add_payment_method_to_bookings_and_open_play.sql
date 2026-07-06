-- migrate:up
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "payment_method" TEXT;
ALTER TABLE "open_play_registrations" ADD COLUMN IF NOT EXISTS "payment_method" TEXT;

-- migrate:down
ALTER TABLE "bookings" DROP COLUMN IF EXISTS "payment_method";
ALTER TABLE "open_play_registrations" DROP COLUMN IF EXISTS "payment_method";
