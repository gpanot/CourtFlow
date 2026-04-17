-- Add push notifications preference to staff members
ALTER TABLE "staff_members"
ADD COLUMN IF NOT EXISTS "push_notifications_enabled" BOOLEAN NOT NULL DEFAULT false;

-- Staff push token registry for FCM
CREATE TABLE IF NOT EXISTS "staff_push_tokens" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'android',
    "device_id" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_push_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "staff_push_tokens_staff_id_token_key"
ON "staff_push_tokens"("staff_id", "token");

CREATE INDEX IF NOT EXISTS "staff_push_tokens_venue_id_active_idx"
ON "staff_push_tokens"("venue_id", "active");

ALTER TABLE "staff_push_tokens"
ADD CONSTRAINT "staff_push_tokens_staff_id_fkey"
FOREIGN KEY ("staff_id") REFERENCES "staff_members"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
