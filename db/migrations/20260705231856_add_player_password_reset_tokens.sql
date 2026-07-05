-- migrate:up
CREATE TABLE "player_password_reset_tokens" (
  "id"         TEXT NOT NULL PRIMARY KEY,
  "player_id"  TEXT NOT NULL REFERENCES "players"("id") ON DELETE CASCADE,
  "jti"        TEXT NOT NULL UNIQUE,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at"    TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "player_password_reset_tokens_player_id_idx" ON "player_password_reset_tokens"("player_id");

-- migrate:down
DROP TABLE "player_password_reset_tokens";
