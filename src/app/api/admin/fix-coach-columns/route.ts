import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";

// TEMPORARY — delete this file after it has been called once on prod
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-fix-secret");
  if (secret !== process.env.JWT_SECRET) return error("Forbidden", 403);

  const results: string[] = [];
  const sqls = [
    `ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "coach_dupr" TEXT`,
    `ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "coach_gender" TEXT`,
    `ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "coach_languages" TEXT[] DEFAULT ARRAY[]::TEXT[]`,
    `ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "coach_specialties" TEXT[] DEFAULT ARRAY[]::TEXT[]`,
    `ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "coach_focus_levels" TEXT[] DEFAULT ARRAY[]::TEXT[]`,
    `ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "coach_years_experience" TEXT`,
    `ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "coach_group_sizes" TEXT[] DEFAULT ARRAY[]::TEXT[]`,
  ];

  for (const sql of sqls) {
    try {
      await prisma.$executeRawUnsafe(sql);
      results.push(`OK: ${sql}`);
    } catch (e) {
      results.push(`ERR: ${sql} → ${e}`);
    }
  }

  // Also mark the migration as applied so prisma migrate deploy won't re-run it
  try {
    await prisma.$executeRawUnsafe(`
      INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
      VALUES (
        gen_random_uuid()::text,
        'manual',
        NOW(),
        '20260614030000_add_missing_coach_columns',
        NULL,
        NULL,
        NOW(),
        1
      )
      ON CONFLICT (migration_name) DO NOTHING
    `);
    results.push("OK: migration record inserted");
  } catch (e) {
    results.push(`ERR inserting migration record: ${e}`);
  }

  return json({ results });
}
