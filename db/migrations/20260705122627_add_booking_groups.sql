-- migrate:up

-- booking_groups: one row per multi-court group booking.
-- Single-court bookings keep booking_group_id = NULL (no data migration needed).
CREATE TABLE booking_groups (
  id TEXT PRIMARY KEY,
  venue_id TEXT NOT NULL REFERENCES venues(id),
  player_id TEXT NOT NULL REFERENCES players(id),
  date DATE NOT NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  total_price_value INT NOT NULL DEFAULT 0,
  payment_ref TEXT UNIQUE,
  payment_status TEXT,
  hold_expires_at TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'confirmed',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  cancelled_at TIMESTAMP
);

CREATE INDEX booking_groups_venue_date ON booking_groups(venue_id, date);
CREATE INDEX booking_groups_player ON booking_groups(player_id);
CREATE INDEX booking_groups_payment_ref ON booking_groups(payment_ref) WHERE payment_ref IS NOT NULL;

-- Add FK from bookings → booking_groups (nullable — existing rows keep NULL)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_group_id TEXT REFERENCES booking_groups(id);
CREATE INDEX bookings_booking_group_id ON bookings(booking_group_id) WHERE booking_group_id IS NOT NULL;

-- migrate:down

ALTER TABLE bookings DROP COLUMN IF EXISTS booking_group_id;
DROP TABLE IF EXISTS booking_groups;
