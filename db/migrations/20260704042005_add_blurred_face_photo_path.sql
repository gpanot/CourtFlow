-- migrate:up
-- Second, blurred+compressed copy of the first-registration check-in photo.
-- Generated asynchronously after registration (never blocks the enrollment flow)
-- so staff can visually verify the AWS-enrolled image quality on the player detail page.
ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "blurred_face_photo_path" TEXT;

-- migrate:down
ALTER TABLE "players" DROP COLUMN IF EXISTS "blurred_face_photo_path";
