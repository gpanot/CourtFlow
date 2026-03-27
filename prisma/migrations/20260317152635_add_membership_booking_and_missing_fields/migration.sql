-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PAID');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('active', 'suspended', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('confirmed', 'cancelled', 'completed', 'no_show');

-- AlterTable
ALTER TABLE "courts" ADD COLUMN     "is_bookable" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "players" ALTER COLUMN "notifications_enabled" SET DEFAULT false;

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "max_players" INTEGER,
ADD COLUMN     "staff_id" TEXT,
ADD COLUMN     "warmup_mode" TEXT NOT NULL DEFAULT 'manual';

-- AlterTable
ALTER TABLE "venues" ADD COLUMN     "logo_url" TEXT,
ADD COLUMN     "tv_text" TEXT;

-- CreateTable
CREATE TABLE "staff_payments" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "week_start" TIMESTAMP(3) NOT NULL,
    "total_hours" DECIMAL(6,1) NOT NULL,
    "amount" DECIMAL(10,0),
    "payment_method" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "paid_at" TIMESTAMP(3),
    "paid_date" TIMESTAMP(3),
    "paid_by_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_tiers" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "price_in_cents" INTEGER NOT NULL,
    "sessions_included" INTEGER,
    "show_badge" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "tier_id" TEXT NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'active',
    "activated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "renewal_date" TIMESTAMP(3) NOT NULL,
    "sessions_used" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "court_id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'confirmed',
    "price_in_cents" INTEGER NOT NULL,
    "co_player_ids" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMP(3),

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staff_payments_week_start_idx" ON "staff_payments"("week_start");

-- CreateIndex
CREATE INDEX "staff_payments_staff_id_idx" ON "staff_payments"("staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_payments_staff_id_week_start_key" ON "staff_payments"("staff_id", "week_start");

-- CreateIndex
CREATE UNIQUE INDEX "membership_tiers_venue_id_sort_order_key" ON "membership_tiers"("venue_id", "sort_order");

-- CreateIndex
CREATE INDEX "memberships_venue_id_idx" ON "memberships"("venue_id");

-- CreateIndex
CREATE INDEX "memberships_tier_id_idx" ON "memberships"("tier_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_player_id_venue_id_key" ON "memberships"("player_id", "venue_id");

-- CreateIndex
CREATE INDEX "bookings_venue_id_date_idx" ON "bookings"("venue_id", "date");

-- CreateIndex
CREATE INDEX "bookings_player_id_idx" ON "bookings"("player_id");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_court_id_date_start_time_key" ON "bookings"("court_id", "date", "start_time");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_payments" ADD CONSTRAINT "staff_payments_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_payments" ADD CONSTRAINT "staff_payments_paid_by_id_fkey" FOREIGN KEY ("paid_by_id") REFERENCES "staff_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_tiers" ADD CONSTRAINT "membership_tiers_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "membership_tiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_court_id_fkey" FOREIGN KEY ("court_id") REFERENCES "courts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
