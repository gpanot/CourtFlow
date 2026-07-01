-- AlterTable: add scalable group pricing fields to coach_packages
ALTER TABLE "coach_packages"
  ADD COLUMN IF NOT EXISTS "min_players" INTEGER,
  ADD COLUMN IF NOT EXISTS "max_players" INTEGER,
  ADD COLUMN IF NOT EXISTS "price_per_additional_player" INTEGER;

-- AlterTable: add player count to coach_lessons
ALTER TABLE "coach_lessons"
  ADD COLUMN IF NOT EXISTS "player_count" INTEGER;
