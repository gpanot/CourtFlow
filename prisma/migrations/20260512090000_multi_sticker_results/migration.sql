-- Allow multiple sticker results per player (removes one-to-one unique constraint)
-- Prisma creates this as a unique INDEX, not a named CONSTRAINT, so we drop the index directly
DROP INDEX IF EXISTS "player_sticker_results_player_id_key";
ALTER TABLE "player_sticker_results" DROP CONSTRAINT IF EXISTS "player_sticker_results_player_id_key";
CREATE INDEX IF NOT EXISTS "player_sticker_results_player_id_idx" ON "player_sticker_results"("player_id");
