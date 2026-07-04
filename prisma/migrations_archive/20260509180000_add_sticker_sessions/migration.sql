-- CreateTable
CREATE TABLE "sticker_sessions" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sticker_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sticker_sessions_token_key" ON "sticker_sessions"("token");

-- AddForeignKey
ALTER TABLE "sticker_sessions" ADD CONSTRAINT "sticker_sessions_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
