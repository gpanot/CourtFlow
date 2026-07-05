-- migrate:up

-- Replace the full unique index on (court_id, date, start_time) with a
-- partial unique index that only enforces uniqueness for active statuses.
-- This allows expired_hold rows to remain in the table for audit purposes
-- without blocking re-booking of the same slot.

DROP INDEX IF EXISTS bookings_court_id_date_start_time_key;

CREATE UNIQUE INDEX bookings_active_slot_unique
  ON bookings (court_id, date, start_time)
  WHERE status IN ('confirmed', 'completed', 'no_show');

-- migrate:down

DROP INDEX IF EXISTS bookings_active_slot_unique;

CREATE UNIQUE INDEX bookings_court_id_date_start_time_key
  ON bookings (court_id, date, start_time);
