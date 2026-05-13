-- CreateTable
CREATE TABLE "sticker_job_queue" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sticker_job_queue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sticker_job_queue_status_created_at_idx" ON "sticker_job_queue"("status", "created_at");

-- AddForeignKey
ALTER TABLE "sticker_job_queue" ADD CONSTRAINT "sticker_job_queue_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
