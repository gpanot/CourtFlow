-- Face photo stored under /uploads/players (see savePlayerFacePhotoFromBase64)
ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "face_photo_path" TEXT;
