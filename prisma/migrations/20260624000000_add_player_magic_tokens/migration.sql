-- One-time magic login tokens for bot-created player accounts
CREATE TABLE IF NOT EXISTS "player_magic_tokens" (
  "id"         TEXT NOT NULL,
  "player_id"  TEXT NOT NULL,
  "jti"        TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at"    TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "player_magic_tokens_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "player_magic_tokens"
    ADD CONSTRAINT "player_magic_tokens_player_id_fkey"
    FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "player_magic_tokens_jti_key" ON "player_magic_tokens"("jti");
CREATE INDEX IF NOT EXISTS "player_magic_tokens_player_id_idx" ON "player_magic_tokens"("player_id");
