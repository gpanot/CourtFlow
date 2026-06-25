/**
 * Read the two most recent coach_lessons rows from the DB:
 * - one booked BEFORE the fix (stored date should be wrong)
 * - one booked AFTER the fix (stored date should be correct)
 * 
 * Shows raw date column value as stored in PG.
 */
import { prisma } from "@/lib/db";

async function main() {
  // Last 10 lessons ordered by createdAt desc — show id, date stored, createdAt
  const rows = await prisma.$queryRaw<{ id: string; date: Date; created_at: Date; status: string }[]>`
    SELECT id, date, created_at, status
    FROM coach_lessons
    ORDER BY created_at DESC
    LIMIT 10
  `;

  console.log("Last 10 coach_lessons (newest first):");
  for (const r of rows) {
    const stored = r.date.toISOString().slice(0, 10);
    console.log(`  id=${r.id.slice(0,8)}  date=${stored}  created_at=${r.created_at.toISOString()}  status=${r.status}`);
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
