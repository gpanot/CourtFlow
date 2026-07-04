-- Hotfix: actually apply the ADD COLUMN statements that were previously
-- recorded as applied via migrate resolve --applied without their SQL running.
-- All columns are nullable or have safe defaults — no data migration needed.

-- staff_members.reclub_group_id (nullable Int)
ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "reclub_group_id" INTEGER;

-- players.reclub_user_id (nullable Int)
ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "reclub_user_id" INTEGER;

-- sessions: five reclub/device columns (all nullable)
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "reclub_reference_code" TEXT;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "reclub_event_name" TEXT;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "reclub_roster" JSONB;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "reclub_snapshot" JSONB;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "opened_on_device" TEXT;
