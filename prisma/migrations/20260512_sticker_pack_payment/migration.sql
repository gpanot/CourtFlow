-- AlterTable: add payment tracking to player_sticker_packs
ALTER TABLE "player_sticker_packs" ADD COLUMN IF NOT EXISTS "is_paid" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "player_sticker_packs" ADD COLUMN IF NOT EXISTS "paid_at" TIMESTAMP(3);
