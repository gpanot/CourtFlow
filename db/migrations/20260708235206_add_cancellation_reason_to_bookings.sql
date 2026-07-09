-- migrate:up

-- Track why a paid booking was cancelled by staff
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- Track why a paid group booking was cancelled by staff
ALTER TABLE booking_groups
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- migrate:down

ALTER TABLE bookings
  DROP COLUMN IF EXISTS cancellation_reason;

ALTER TABLE booking_groups
  DROP COLUMN IF EXISTS cancellation_reason;
