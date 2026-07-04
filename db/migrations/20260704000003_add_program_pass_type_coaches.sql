-- migrate:up
CREATE TABLE "program_pass_type_coaches" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "pass_type_id" TEXT NOT NULL REFERENCES "program_pass_types"("id") ON DELETE CASCADE,
  "coach_id" TEXT NOT NULL REFERENCES "staff_members"("id") ON DELETE CASCADE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("id"),
  UNIQUE ("pass_type_id", "coach_id")
);
CREATE INDEX ON "program_pass_type_coaches"("pass_type_id");

-- migrate:down
DROP TABLE "program_pass_type_coaches";
