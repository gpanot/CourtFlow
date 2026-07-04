-- Venues: add WhatsApp, Zalo, and Line contact fields
ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "contact_whatsapp" TEXT;
ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "contact_zalo" TEXT;
ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "contact_line" TEXT;
