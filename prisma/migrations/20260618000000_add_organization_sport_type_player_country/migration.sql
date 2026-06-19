-- CreateTable
CREATE TABLE IF NOT EXISTS "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "payment_region" TEXT NOT NULL DEFAULT 'SEA',
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
DO $$ BEGIN
    CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable: add organization_id and sport_type to venues
ALTER TABLE "venues"
    ADD COLUMN IF NOT EXISTS "organization_id" TEXT,
    ADD COLUMN IF NOT EXISTS "sport_type" TEXT NOT NULL DEFAULT 'pickleball';

-- CreateIndex on venues.organization_id
DO $$ BEGIN
    CREATE INDEX "venues_organization_id_idx" ON "venues"("organization_id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey from venues to organizations
DO $$ BEGIN
    ALTER TABLE "venues" ADD CONSTRAINT "venues_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable: add country to player_accounts
ALTER TABLE "player_accounts"
    ADD COLUMN IF NOT EXISTS "country" TEXT;
