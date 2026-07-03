-- CreateEnum
CREATE TYPE "ClassPassStatus" AS ENUM ('active', 'paused', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "ClassPassPaymentStatus" AS ENUM ('UNPAID', 'PAID', 'OVERDUE');

-- CreateTable
CREATE TABLE "class_pass_tiers" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "sessions_included" INTEGER NOT NULL DEFAULT 12,
    "cycle_length_days" INTEGER NOT NULL DEFAULT 30,
    "linked_coach_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_pass_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_passes" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "tier_id" TEXT NOT NULL,
    "status" "ClassPassStatus" NOT NULL DEFAULT 'active',
    "activated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deferred_start_date" TIMESTAMP(3),
    "cycle_start" TIMESTAMP(3) NOT NULL,
    "cycle_end" TIMESTAMP(3) NOT NULL,
    "sessions_used" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_passes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_pass_payments" (
    "id" TEXT NOT NULL,
    "class_pass_id" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "amount_value" INTEGER NOT NULL,
    "status" "ClassPassPaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "payment_method" TEXT,
    "paid_at" TIMESTAMP(3),
    "proof_url" TEXT,
    "note" TEXT,
    "void_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_pass_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_instances" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "court_id" TEXT,
    "tier_id" TEXT NOT NULL,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "max_players" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_check_ins" (
    "id" TEXT NOT NULL,
    "class_pass_id" TEXT NOT NULL,
    "class_instance_id" TEXT NOT NULL,
    "checked_in_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_check_ins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "class_pass_tiers_venue_id_is_active_idx" ON "class_pass_tiers"("venue_id", "is_active");

-- CreateIndex
CREATE INDEX "class_pass_tiers_linked_coach_id_idx" ON "class_pass_tiers"("linked_coach_id");

-- CreateIndex
CREATE INDEX "class_passes_player_id_venue_id_idx" ON "class_passes"("player_id", "venue_id");

-- CreateIndex
CREATE INDEX "class_passes_venue_id_status_idx" ON "class_passes"("venue_id", "status");

-- CreateIndex
CREATE INDEX "class_passes_tier_id_idx" ON "class_passes"("tier_id");

-- CreateIndex
CREATE INDEX "class_pass_payments_class_pass_id_idx" ON "class_pass_payments"("class_pass_id");

-- CreateIndex
CREATE INDEX "class_pass_payments_status_idx" ON "class_pass_payments"("status");

-- CreateIndex
CREATE INDEX "class_instances_venue_id_start_at_idx" ON "class_instances"("venue_id", "start_at");

-- CreateIndex
CREATE INDEX "class_instances_coach_id_start_at_idx" ON "class_instances"("coach_id", "start_at");

-- CreateIndex
CREATE INDEX "class_instances_tier_id_idx" ON "class_instances"("tier_id");

-- CreateIndex
CREATE INDEX "class_check_ins_class_instance_id_idx" ON "class_check_ins"("class_instance_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_check_ins_class_pass_id_class_instance_id_key" ON "class_check_ins"("class_pass_id", "class_instance_id");

-- AddForeignKey
ALTER TABLE "class_pass_tiers" ADD CONSTRAINT "class_pass_tiers_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_pass_tiers" ADD CONSTRAINT "class_pass_tiers_linked_coach_id_fkey" FOREIGN KEY ("linked_coach_id") REFERENCES "staff_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_passes" ADD CONSTRAINT "class_passes_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_passes" ADD CONSTRAINT "class_passes_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_passes" ADD CONSTRAINT "class_passes_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "class_pass_tiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_pass_payments" ADD CONSTRAINT "class_pass_payments_class_pass_id_fkey" FOREIGN KEY ("class_pass_id") REFERENCES "class_passes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_instances" ADD CONSTRAINT "class_instances_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_instances" ADD CONSTRAINT "class_instances_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "staff_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_instances" ADD CONSTRAINT "class_instances_court_id_fkey" FOREIGN KEY ("court_id") REFERENCES "courts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_instances" ADD CONSTRAINT "class_instances_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "class_pass_tiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_check_ins" ADD CONSTRAINT "class_check_ins_class_pass_id_fkey" FOREIGN KEY ("class_pass_id") REFERENCES "class_passes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_check_ins" ADD CONSTRAINT "class_check_ins_class_instance_id_fkey" FOREIGN KEY ("class_instance_id") REFERENCES "class_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
