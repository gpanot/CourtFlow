import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-secret");
  if (secret !== "fix-migration-now") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await prisma.$executeRawUnsafe(`
      UPDATE "_prisma_migrations"
      SET "rolled_back_at" = NOW(), "finished_at" = NOW()
      WHERE "migration_name" = '20260613020000_add_missing_tables'
        AND "rolled_back_at" IS NULL
        AND "finished_at" IS NULL
    `);

    return NextResponse.json({ ok: true, rowsAffected: result });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
