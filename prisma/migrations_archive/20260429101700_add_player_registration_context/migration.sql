-- Capture first signup context for admin player profile.
ALTER TABLE "players"
ADD COLUMN "registration_at" TIMESTAMP(3),
ADD COLUMN "registration_venue_id" TEXT;

CREATE INDEX "players_registration_venue_id_idx"
ON "players"("registration_venue_id");

ALTER TABLE "players"
ADD CONSTRAINT "players_registration_venue_id_fkey"
FOREIGN KEY ("registration_venue_id") REFERENCES "venues"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill timestamp for historical players; venue is unknown historically.
UPDATE "players"
SET "registration_at" = "created_at"
WHERE "registration_at" IS NULL;
