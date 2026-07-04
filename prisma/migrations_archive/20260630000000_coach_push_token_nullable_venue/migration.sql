-- Make venue_id nullable on staff_push_tokens so coach accounts
-- (which never select a venue) can register FCM tokens.
ALTER TABLE "staff_push_tokens" ALTER COLUMN "venue_id" DROP NOT NULL;
