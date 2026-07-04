-- AlterTable
ALTER TABLE "membership_tiers" ADD COLUMN     "perks" JSONB NOT NULL DEFAULT '[]';
