-- Add 'manager' value to StaffRole enum
ALTER TYPE "StaffRole" ADD VALUE IF NOT EXISTS 'manager' BEFORE 'superadmin';

-- Add owner_id column to venues
ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "owner_id" TEXT;

-- Add foreign key constraint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'venues_owner_id_fkey'
  ) THEN
    ALTER TABLE "venues" ADD CONSTRAINT "venues_owner_id_fkey"
      FOREIGN KEY ("owner_id") REFERENCES "staff_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
