-- Face recognition diagnostics (live check-in SearchFaces scores)
CREATE TABLE "face_recognition_logs" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "player_id" TEXT,
    "staff_id" TEXT,
    "similarity_score" DOUBLE PRECISION,
    "threshold" DOUBLE PRECISION NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "face_recognition_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "face_recognition_logs_venue_id_created_at_idx" ON "face_recognition_logs"("venue_id", "created_at");

ALTER TABLE "face_recognition_logs" ADD CONSTRAINT "face_recognition_logs_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "face_recognition_logs" ADD CONSTRAINT "face_recognition_logs_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "face_recognition_logs" ADD CONSTRAINT "face_recognition_logs_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
