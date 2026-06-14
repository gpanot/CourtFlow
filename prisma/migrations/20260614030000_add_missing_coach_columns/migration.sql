-- Add missing coach profile columns to staff_members
-- These were added to the Prisma schema but never had a migration generated

ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "coach_dupr" TEXT;
ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "coach_gender" TEXT;
ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "coach_languages" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "coach_specialties" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "coach_focus_levels" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "coach_years_experience" TEXT;
ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "coach_group_sizes" TEXT[] DEFAULT ARRAY[]::TEXT[];
