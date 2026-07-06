-- migrate:up

-- Sequence counters per (venue, type, year)
CREATE TABLE "invoice_sequences" (
  "id"        SERIAL PRIMARY KEY,
  "venue_id"  TEXT NOT NULL,
  "type"      TEXT NOT NULL,   -- BK | OP | CL
  "year"      INT  NOT NULL,
  "last_seq"  INT  NOT NULL DEFAULT 0,
  UNIQUE ("venue_id", "type", "year")
);

-- Invoice numbers on each entity
ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "invoice_number" TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS "invoiced_at"    TIMESTAMPTZ;

ALTER TABLE "booking_groups"
  ADD COLUMN IF NOT EXISTS "invoice_number" TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS "invoiced_at"    TIMESTAMPTZ;

ALTER TABLE "open_play_registrations"
  ADD COLUMN IF NOT EXISTS "invoice_number" TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS "invoiced_at"    TIMESTAMPTZ;

ALTER TABLE "coach_lessons"
  ADD COLUMN IF NOT EXISTS "invoice_number" TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS "invoiced_at"    TIMESTAMPTZ;

-- migrate:down

ALTER TABLE "bookings"
  DROP COLUMN IF EXISTS "invoice_number",
  DROP COLUMN IF EXISTS "invoiced_at";

ALTER TABLE "booking_groups"
  DROP COLUMN IF EXISTS "invoice_number",
  DROP COLUMN IF EXISTS "invoiced_at";

ALTER TABLE "open_play_registrations"
  DROP COLUMN IF EXISTS "invoice_number",
  DROP COLUMN IF EXISTS "invoiced_at";

ALTER TABLE "coach_lessons"
  DROP COLUMN IF EXISTS "invoice_number",
  DROP COLUMN IF EXISTS "invoiced_at";

DROP TABLE IF EXISTS "invoice_sequences";
