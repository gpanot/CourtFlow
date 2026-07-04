-- Venues: add slug (was added via db push, no migration existed)
ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "slug" TEXT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'venues_slug_key') THEN
    CREATE UNIQUE INDEX "venues_slug_key" ON "venues"("slug");
  END IF;
END $$;

-- CoachLessons: add missing payment tracking fields (were added via db push)
ALTER TABLE "coach_lessons" ADD COLUMN IF NOT EXISTS "payment_status" TEXT NOT NULL DEFAULT 'UNPAID';
ALTER TABLE "coach_lessons" ADD COLUMN IF NOT EXISTS "payment_method" TEXT;
ALTER TABLE "coach_lessons" ADD COLUMN IF NOT EXISTS "payment_note" TEXT;
ALTER TABLE "coach_lessons" ADD COLUMN IF NOT EXISTS "payment_ref" TEXT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'coach_lessons_payment_ref_key') THEN
    CREATE UNIQUE INDEX "coach_lessons_payment_ref_key" ON "coach_lessons"("payment_ref");
  END IF;
END $$;
