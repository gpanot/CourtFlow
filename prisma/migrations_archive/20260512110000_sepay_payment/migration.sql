-- Add payment_code to player_sticker_packs for SePay webhook matching
ALTER TABLE "player_sticker_packs" ADD COLUMN IF NOT EXISTS "payment_code" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "player_sticker_packs_payment_code_key" ON "player_sticker_packs"("payment_code");

-- SePay transaction log for deduplication and audit
CREATE TABLE IF NOT EXISTS "sticker_payment_logs" (
  "id"              TEXT NOT NULL,
  "sepay_id"        INTEGER NOT NULL,
  "payment_code"    TEXT NOT NULL,
  "transfer_amount" INTEGER NOT NULL,
  "content"         TEXT NOT NULL,
  "processed_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sticker_payment_logs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "sticker_payment_logs_sepay_id_key" ON "sticker_payment_logs"("sepay_id");
