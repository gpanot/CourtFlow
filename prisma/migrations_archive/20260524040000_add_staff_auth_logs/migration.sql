-- CreateTable (idempotent — safe to re-run if table already exists from db push)
CREATE TABLE IF NOT EXISTS "staff_auth_logs" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT,
    "action" TEXT NOT NULL,
    "phone" TEXT,
    "ip_address" TEXT,
    "country" TEXT,
    "city" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_auth_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "staff_auth_logs_staff_id_idx" ON "staff_auth_logs"("staff_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "staff_auth_logs_created_at_idx" ON "staff_auth_logs"("created_at");

-- AddForeignKey (idempotent check)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'staff_auth_logs_staff_id_fkey'
          AND table_name = 'staff_auth_logs'
    ) THEN
        ALTER TABLE "staff_auth_logs"
            ADD CONSTRAINT "staff_auth_logs_staff_id_fkey"
            FOREIGN KEY ("staff_id") REFERENCES "staff_members"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
