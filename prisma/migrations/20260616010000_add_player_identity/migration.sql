-- CreateTable: player_identities
CREATE TABLE IF NOT EXISTS "player_identities" (
    "id"          TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "email"       TEXT,
    "phone"       TEXT,
    "skill_level" TEXT,
    "gender"      TEXT,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_identities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique email on player_identities
CREATE UNIQUE INDEX IF NOT EXISTS "player_identities_email_key" ON "player_identities"("email");

-- AlterTable: add player_identity_id to players
ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "player_identity_id" TEXT;

-- AlterTable: add player_identity_id to check_in_players
ALTER TABLE "check_in_players" ADD COLUMN IF NOT EXISTS "player_identity_id" TEXT;

-- CreateIndex: index on players.player_identity_id
CREATE INDEX IF NOT EXISTS "players_player_identity_id_idx" ON "players"("player_identity_id");

-- CreateIndex: index on check_in_players.player_identity_id
CREATE INDEX IF NOT EXISTS "check_in_players_player_identity_id_idx" ON "check_in_players"("player_identity_id");

-- AddForeignKey: players -> player_identities
DO $$ BEGIN
    ALTER TABLE "players" ADD CONSTRAINT "players_player_identity_id_fkey"
        FOREIGN KEY ("player_identity_id") REFERENCES "player_identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey: check_in_players -> player_identities
DO $$ BEGIN
    ALTER TABLE "check_in_players" ADD CONSTRAINT "check_in_players_player_identity_id_fkey"
        FOREIGN KEY ("player_identity_id") REFERENCES "player_identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
