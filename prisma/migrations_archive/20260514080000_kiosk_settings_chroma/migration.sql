-- AlterTable: add chroma_tolerance and feather_radius to kiosk_settings
ALTER TABLE "kiosk_settings" ADD COLUMN IF NOT EXISTS "chroma_tolerance" INTEGER NOT NULL DEFAULT 65;
ALTER TABLE "kiosk_settings" ADD COLUMN IF NOT EXISTS "feather_radius" DOUBLE PRECISION NOT NULL DEFAULT 0.8;
