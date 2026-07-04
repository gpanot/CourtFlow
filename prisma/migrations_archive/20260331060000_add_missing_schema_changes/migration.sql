-- CreateEnum
CREATE TYPE "PlayerAppAuthMethod" AS ENUM ('face_pwa', 'wristband', 'phone_otp');

-- AlterTable
ALTER TABLE "face_attempts" ADD COLUMN "phone_number" TEXT;

-- CreateTable
CREATE TABLE "player_app_auth_logs" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "method" "PlayerAppAuthMethod" NOT NULL,
    "session_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_app_auth_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "player_app_auth_logs_player_id_created_at_idx" ON "player_app_auth_logs"("player_id", "created_at");

-- AddForeignKey
ALTER TABLE "player_app_auth_logs" ADD CONSTRAINT "player_app_auth_logs_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
