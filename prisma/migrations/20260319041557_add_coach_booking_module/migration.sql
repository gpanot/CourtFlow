-- CreateEnum
CREATE TYPE "LessonType" AS ENUM ('private', 'group');

-- CreateEnum
CREATE TYPE "CoachLessonStatus" AS ENUM ('confirmed', 'completed', 'cancelled', 'no_show');

-- AlterTable
ALTER TABLE "staff_members" ADD COLUMN     "coach_bio" TEXT,
ADD COLUMN     "coach_photo" TEXT,
ADD COLUMN     "is_coach" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "coach_packages" (
    "id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "lesson_type" "LessonType" NOT NULL,
    "duration_min" INTEGER NOT NULL,
    "price_in_cents" INTEGER NOT NULL,
    "sessions_included" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coach_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_lessons" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "court_id" TEXT,
    "package_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "status" "CoachLessonStatus" NOT NULL DEFAULT 'confirmed',
    "price_in_cents" INTEGER NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMP(3),

    CONSTRAINT "coach_lessons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coach_packages_coach_id_idx" ON "coach_packages"("coach_id");

-- CreateIndex
CREATE INDEX "coach_packages_venue_id_idx" ON "coach_packages"("venue_id");

-- CreateIndex
CREATE INDEX "coach_lessons_venue_id_date_idx" ON "coach_lessons"("venue_id", "date");

-- CreateIndex
CREATE INDEX "coach_lessons_coach_id_date_idx" ON "coach_lessons"("coach_id", "date");

-- CreateIndex
CREATE INDEX "coach_lessons_player_id_idx" ON "coach_lessons"("player_id");

-- AddForeignKey
ALTER TABLE "coach_packages" ADD CONSTRAINT "coach_packages_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "staff_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_packages" ADD CONSTRAINT "coach_packages_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_lessons" ADD CONSTRAINT "coach_lessons_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_lessons" ADD CONSTRAINT "coach_lessons_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "staff_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_lessons" ADD CONSTRAINT "coach_lessons_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_lessons" ADD CONSTRAINT "coach_lessons_court_id_fkey" FOREIGN KEY ("court_id") REFERENCES "courts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_lessons" ADD CONSTRAINT "coach_lessons_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "coach_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
