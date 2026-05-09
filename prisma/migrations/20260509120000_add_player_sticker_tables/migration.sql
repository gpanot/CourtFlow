-- Player sticker upload photos (slots 2-4)
CREATE TABLE IF NOT EXISTS "player_sticker_photos" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "player_id" TEXT NOT NULL,
  "image_url" TEXT NOT NULL,
  "slot_index" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "player_sticker_photos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "player_sticker_photos_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "player_sticker_photos_slot_index_check" CHECK ("slot_index" BETWEEN 2 AND 4)
);

CREATE UNIQUE INDEX IF NOT EXISTS "player_sticker_photos_player_id_slot_index_key"
  ON "player_sticker_photos"("player_id", "slot_index");

-- Player sticker generation results (one per player, overwrite pattern)
CREATE TABLE IF NOT EXISTS "player_sticker_results" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "player_id" TEXT NOT NULL,
  "image_url" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "model" VARCHAR(50) NOT NULL DEFAULT 'gpt-image-1',
  "size" VARCHAR(20) NOT NULL DEFAULT '1024x1024',
  "cost_usd" DECIMAL(6,4) NOT NULL DEFAULT 0.04,
  "generation_time_seconds" DECIMAL(6,2),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "player_sticker_results_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "player_sticker_results_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "player_sticker_results_player_id_key"
  ON "player_sticker_results"("player_id");
