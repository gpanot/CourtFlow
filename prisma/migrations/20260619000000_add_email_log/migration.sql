-- CreateTable
CREATE TABLE IF NOT EXISTS "email_logs" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "booking_type" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "email_type" TEXT NOT NULL,
    "resend_message_id" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'sent',

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "email_logs_booking_id_email_type_idx" ON "email_logs"("booking_id", "email_type");
