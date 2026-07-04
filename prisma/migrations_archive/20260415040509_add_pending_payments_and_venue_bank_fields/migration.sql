-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "session_fee" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "venues" ADD COLUMN     "bank_account" TEXT,
ADD COLUMN     "bank_name" TEXT,
ADD COLUMN     "bank_owner_name" TEXT;

-- CreateTable
CREATE TABLE "pending_payments" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "payment_method" TEXT NOT NULL DEFAULT 'vietqr',
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "confirmed_at" TIMESTAMP(3),
    "confirmed_by" TEXT,

    CONSTRAINT "pending_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pending_payments_venue_id_status_idx" ON "pending_payments"("venue_id", "status");

-- CreateIndex
CREATE INDEX "pending_payments_session_id_idx" ON "pending_payments"("session_id");

-- AddForeignKey
ALTER TABLE "pending_payments" ADD CONSTRAINT "pending_payments_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_payments" ADD CONSTRAINT "pending_payments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_payments" ADD CONSTRAINT "pending_payments_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
