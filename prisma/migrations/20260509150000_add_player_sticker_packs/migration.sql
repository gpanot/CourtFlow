-- CreateTable
CREATE TABLE "player_sticker_packs" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "result_id" TEXT NOT NULL,
    "sticker_1_url" TEXT,
    "sticker_2_url" TEXT,
    "sticker_3_url" TEXT,
    "sticker_4_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_sticker_packs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "player_sticker_packs_player_id_key" ON "player_sticker_packs"("player_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_sticker_packs_result_id_key" ON "player_sticker_packs"("result_id");

-- AddForeignKey
ALTER TABLE "player_sticker_packs" ADD CONSTRAINT "player_sticker_packs_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_sticker_packs" ADD CONSTRAINT "player_sticker_packs_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "player_sticker_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;
