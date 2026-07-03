-- Rename ClassPassTier → ClassPassType
-- All ClassPass tables confirmed empty in production before this runs.

-- Drop foreign keys referencing class_pass_tiers before renaming the table
ALTER TABLE "class_passes" DROP CONSTRAINT "class_passes_tier_id_fkey";
ALTER TABLE "class_instances" DROP CONSTRAINT "class_instances_tier_id_fkey";

-- Rename the table itself
ALTER TABLE "class_pass_tiers" RENAME TO "class_pass_types";

-- Rename primary key constraint
ALTER TABLE "class_pass_types" RENAME CONSTRAINT "class_pass_tiers_pkey" TO "class_pass_types_pkey";

-- Rename FK constraints on class_pass_types (venue + coach)
ALTER TABLE "class_pass_types" RENAME CONSTRAINT "class_pass_tiers_venue_id_fkey" TO "class_pass_types_venue_id_fkey";
ALTER TABLE "class_pass_types" RENAME CONSTRAINT "class_pass_tiers_linked_coach_id_fkey" TO "class_pass_types_linked_coach_id_fkey";

-- Rename indexes on class_pass_types
ALTER INDEX "class_pass_tiers_venue_id_is_active_idx" RENAME TO "class_pass_types_venue_id_is_active_idx";
ALTER INDEX "class_pass_tiers_linked_coach_id_idx" RENAME TO "class_pass_types_linked_coach_id_idx";

-- Rename FK column on class_passes: tier_id → pass_type_id
ALTER TABLE "class_passes" RENAME COLUMN "tier_id" TO "pass_type_id";

-- Rename the index that embedded the old column name
ALTER INDEX "class_passes_tier_id_idx" RENAME TO "class_passes_pass_type_id_idx";

-- Re-add FK from class_passes pointing at the renamed table/column
ALTER TABLE "class_passes"
  ADD CONSTRAINT "class_passes_pass_type_id_fkey"
  FOREIGN KEY ("pass_type_id") REFERENCES "class_pass_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rename FK column on class_instances: tier_id → pass_type_id
ALTER TABLE "class_instances" RENAME COLUMN "tier_id" TO "pass_type_id";

-- Rename the index that embedded the old column name
ALTER INDEX "class_instances_tier_id_idx" RENAME TO "class_instances_pass_type_id_idx";

-- Re-add FK from class_instances pointing at the renamed table/column
ALTER TABLE "class_instances"
  ADD CONSTRAINT "class_instances_pass_type_id_fkey"
  FOREIGN KEY ("pass_type_id") REFERENCES "class_pass_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
