-- migrate:up

-- The baseline migration (20260704000001) was dumped from a stale DB state and
-- omitted several columns that the Prisma schema / application code expect.
-- On a freshly-migrated production DB this causes Prisma SELECTs to fail with
-- "column ... does not exist" (500 errors), e.g. GET /api/admin/sticker-explorer.
-- These statements are all idempotent so they are safe no-ops on any DB that
-- already has the correct shape (e.g. local dev).

-- player_sticker_packs: PayOS order code + "how to" card URL
ALTER TABLE "player_sticker_packs" ADD COLUMN IF NOT EXISTS "payos_order_code" TEXT;
ALTER TABLE "player_sticker_packs" ADD COLUMN IF NOT EXISTS "how_to_card_url" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "player_sticker_packs_payos_order_code_key"
  ON "player_sticker_packs" ("payos_order_code");

-- sticker_payment_logs: reconcile the legacy SePay-era shape to the PayOS shape
-- the code uses. Drop the dead sepay_id column and add payos_order_code.
ALTER TABLE "sticker_payment_logs" ADD COLUMN IF NOT EXISTS "payos_order_code" TEXT;
ALTER TABLE "sticker_payment_logs" ALTER COLUMN "content" SET DEFAULT '';
UPDATE "sticker_payment_logs" SET "payos_order_code" = "id" WHERE "payos_order_code" IS NULL;
ALTER TABLE "sticker_payment_logs" ALTER COLUMN "payos_order_code" SET NOT NULL;
ALTER TABLE "sticker_payment_logs" DROP COLUMN IF EXISTS "sepay_id";
CREATE UNIQUE INDEX IF NOT EXISTS "sticker_payment_logs_payos_order_code_key"
  ON "sticker_payment_logs" ("payos_order_code");

-- migrate:down

DROP INDEX IF EXISTS "sticker_payment_logs_payos_order_code_key";
ALTER TABLE "sticker_payment_logs" ADD COLUMN IF NOT EXISTS "sepay_id" INTEGER;
ALTER TABLE "sticker_payment_logs" DROP COLUMN IF EXISTS "payos_order_code";
ALTER TABLE "sticker_payment_logs" ALTER COLUMN "content" DROP DEFAULT;

DROP INDEX IF EXISTS "player_sticker_packs_payos_order_code_key";
ALTER TABLE "player_sticker_packs" DROP COLUMN IF EXISTS "how_to_card_url";
ALTER TABLE "player_sticker_packs" DROP COLUMN IF EXISTS "payos_order_code";
