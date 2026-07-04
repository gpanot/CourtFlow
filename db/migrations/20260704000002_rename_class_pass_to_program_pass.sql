-- migrate:up
ALTER TABLE IF EXISTS "class_pass_tiers" RENAME TO "program_pass_types";
ALTER TABLE IF EXISTS "class_pass_types" RENAME TO "program_pass_types";
ALTER TABLE "class_passes" RENAME COLUMN "tier_id" TO "pass_type_id";
ALTER TABLE "class_instances" RENAME COLUMN "tier_id" TO "pass_type_id";
ALTER INDEX IF EXISTS "class_pass_tiers_pkey" RENAME TO "program_pass_types_pkey";
ALTER INDEX IF EXISTS "class_pass_types_pkey" RENAME TO "program_pass_types_pkey";

-- migrate:down
ALTER TABLE "program_pass_types" RENAME TO "class_pass_tiers";
ALTER TABLE "class_passes" RENAME COLUMN "pass_type_id" TO "tier_id";
ALTER TABLE "class_instances" RENAME COLUMN "pass_type_id" TO "tier_id";
