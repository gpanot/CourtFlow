-- Drop the unique index on player_id that Prisma created for the old @unique constraint.
-- This is separate from any named CONSTRAINT — it is a plain index.
DROP INDEX IF EXISTS "player_sticker_results_player_id_key";
