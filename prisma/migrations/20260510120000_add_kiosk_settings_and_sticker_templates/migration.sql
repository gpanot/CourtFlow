-- CreateTable
CREATE TABLE "kiosk_settings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "sticker_price" INTEGER NOT NULL DEFAULT 30000,
    "bank_bin" TEXT NOT NULL DEFAULT '',
    "bank_account" TEXT NOT NULL DEFAULT '',
    "bank_owner_name" TEXT NOT NULL DEFAULT '',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kiosk_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sticker_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "male_prompt" TEXT NOT NULL,
    "female_prompt" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sticker_templates_pkey" PRIMARY KEY ("id")
);

-- DropIndex: remove unique constraints from player_sticker_packs so multiple packs per player are allowed
DROP INDEX IF EXISTS "player_sticker_packs_player_id_key";
DROP INDEX IF EXISTS "player_sticker_packs_result_id_key";

-- CreateIndex: add non-unique index on player_id for query performance
CREATE INDEX IF NOT EXISTS "player_sticker_packs_player_id_idx" ON "player_sticker_packs"("player_id");
