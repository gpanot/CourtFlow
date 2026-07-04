-- CreateEnum
CREATE TYPE "SessionType" AS ENUM ('open_play', 'competition');

-- CreateEnum
CREATE TYPE "CourtBlockType" AS ENUM ('private_competition', 'private_event', 'maintenance');

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "title" TEXT,
ADD COLUMN     "type" "SessionType" NOT NULL DEFAULT 'open_play';

-- CreateTable
CREATE TABLE "court_blocks" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "type" "CourtBlockType" NOT NULL,
    "title" TEXT,
    "note" TEXT,
    "court_ids" TEXT[],
    "date" DATE NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "court_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "court_blocks_venue_id_date_idx" ON "court_blocks"("venue_id", "date");

-- AddForeignKey
ALTER TABLE "court_blocks" ADD CONSTRAINT "court_blocks_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
