-- migrate:up
ALTER TABLE "staff_members"
  ADD COLUMN IF NOT EXISTS "token_version" INTEGER NOT NULL DEFAULT 0;

-- migrate:down
ALTER TABLE "staff_members" DROP COLUMN IF EXISTS "token_version";

