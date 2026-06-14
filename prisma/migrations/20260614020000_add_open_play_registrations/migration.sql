-- CreateTable: open_play_registrations
CREATE TABLE IF NOT EXISTS "open_play_registrations" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "schedule_entry_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "player_id" TEXT NOT NULL,
    "price_value" INTEGER NOT NULL,
    "payment_status" TEXT NOT NULL DEFAULT 'pending',
    "hold_expires_at" TIMESTAMP(3),
    "payment_proof_url" TEXT,
    "payment_ref" TEXT,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMP(3),

    CONSTRAINT "open_play_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "open_play_registrations_payment_ref_key" ON "open_play_registrations"("payment_ref");

CREATE UNIQUE INDEX IF NOT EXISTS "open_play_registrations_schedule_entry_id_date_player_id_key" ON "open_play_registrations"("schedule_entry_id", "date", "player_id");

CREATE INDEX IF NOT EXISTS "open_play_registrations_schedule_entry_id_date_idx" ON "open_play_registrations"("schedule_entry_id", "date");

CREATE INDEX IF NOT EXISTS "open_play_registrations_venue_id_date_idx" ON "open_play_registrations"("venue_id", "date");

CREATE INDEX IF NOT EXISTS "open_play_registrations_player_id_idx" ON "open_play_registrations"("player_id");

-- AddForeignKey (idempotent via DO block)
DO $$ BEGIN
  ALTER TABLE "open_play_registrations" ADD CONSTRAINT "open_play_registrations_venue_id_fkey"
    FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "open_play_registrations" ADD CONSTRAINT "open_play_registrations_player_id_fkey"
    FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
