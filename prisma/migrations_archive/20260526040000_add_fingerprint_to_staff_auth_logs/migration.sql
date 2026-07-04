-- AlterTable
ALTER TABLE "staff_auth_logs"
  ADD COLUMN IF NOT EXISTS "fingerprint_id"         TEXT,
  ADD COLUMN IF NOT EXISTS "fingerprint_confidence" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "is_vpn"                 BOOLEAN,
  ADD COLUMN IF NOT EXISTS "is_threat"              BOOLEAN;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "staff_auth_logs_fingerprint_id_idx" ON "staff_auth_logs"("fingerprint_id");
