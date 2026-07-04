-- AlterTable
ALTER TABLE "players" ADD COLUMN "ranking_score" INTEGER NOT NULL DEFAULT 200;
ALTER TABLE "players" ADD COLUMN "ranking_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "players" ADD COLUMN "last_ranked_at" TIMESTAMP(3);

UPDATE "players" SET "ranking_score" = 100 WHERE "skill_level" = 'beginner';
UPDATE "players" SET "ranking_score" = 200 WHERE "skill_level" = 'intermediate';
UPDATE "players" SET "ranking_score" = 300 WHERE "skill_level" = 'advanced';
UPDATE "players" SET "ranking_score" = 350 WHERE "skill_level" = 'pro';

-- CreateTable
CREATE TABLE "player_rankings" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "court_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "score_delta" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_rankings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "player_rankings_session_id_court_id_idx" ON "player_rankings"("session_id", "court_id");

-- CreateIndex
CREATE INDEX "player_rankings_session_id_court_id_created_at_idx" ON "player_rankings"("session_id", "court_id", "created_at");

-- AddForeignKey
ALTER TABLE "player_rankings" ADD CONSTRAINT "player_rankings_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "player_rankings" ADD CONSTRAINT "player_rankings_court_id_fkey" FOREIGN KEY ("court_id") REFERENCES "courts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "player_rankings" ADD CONSTRAINT "player_rankings_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "player_rankings" ADD CONSTRAINT "player_rankings_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
