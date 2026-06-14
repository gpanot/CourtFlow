-- CreateTable
CREATE TABLE IF NOT EXISTS "player_notes" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "player_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "player_notes_player_id_venue_id_key" ON "player_notes"("player_id", "venue_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "player_notes_venue_id_idx" ON "player_notes"("venue_id");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "player_notes" ADD CONSTRAINT "player_notes_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "player_notes" ADD CONSTRAINT "player_notes_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
