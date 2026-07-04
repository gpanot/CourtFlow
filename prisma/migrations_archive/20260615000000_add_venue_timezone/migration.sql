-- AddColumn: timezone to venues table, defaulting to Asia/Ho_Chi_Minh
ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh';
