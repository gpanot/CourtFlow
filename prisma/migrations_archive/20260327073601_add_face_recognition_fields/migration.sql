/*
  Warnings:

  - The `payment_status` column on the `coach_lessons` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "coach_lessons" ADD COLUMN     "proof_url" TEXT,
DROP COLUMN "payment_status",
ADD COLUMN     "payment_status" TEXT NOT NULL DEFAULT 'UNPAID';

-- AlterTable
ALTER TABLE "courts" ADD COLUMN     "skip_warmup_after_maintenance" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "players" ADD COLUMN     "face_subject_id" TEXT;

-- AlterTable
ALTER TABLE "queue_entries" ADD COLUMN     "queue_number" INTEGER;

-- CreateTable
CREATE TABLE "face_attempts" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "matched_player_id" TEXT,
    "result_type" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "image_url" TEXT,
    "created_new_player" BOOLEAN NOT NULL DEFAULT false,
    "host_reviewed" BOOLEAN NOT NULL DEFAULT false,
    "queue_number_assigned" INTEGER,
    "kiosk_device_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "face_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kiosk_devices" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kiosk_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "face_attempts_event_id_idx" ON "face_attempts"("event_id");

-- CreateIndex
CREATE INDEX "face_attempts_created_at_idx" ON "face_attempts"("created_at");

-- AddForeignKey
ALTER TABLE "face_attempts" ADD CONSTRAINT "face_attempts_matched_player_id_fkey" FOREIGN KEY ("matched_player_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;
