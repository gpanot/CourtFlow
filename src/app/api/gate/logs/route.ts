import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const SITE_PASSWORD = process.env.SITE_PASSWORD || "CourtFlow2026!";

export async function POST(req: NextRequest) {
  const { password } = await req.json();

  if (password !== SITE_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS gate_attempts (
        id SERIAL PRIMARY KEY,
        ip TEXT,
        user_agent TEXT,
        success BOOLEAN NOT NULL DEFAULT false,
        attempted_password TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const logs = await prisma.$queryRawUnsafe<
      { id: number; ip: string; user_agent: string | null; success: boolean; attempted_password: string | null; created_at: Date }[]
    >(`SELECT id, ip, user_agent, success, attempted_password, created_at FROM gate_attempts ORDER BY created_at DESC LIMIT 100`);

    return NextResponse.json({ logs });
  } catch {
    return NextResponse.json({ error: "Failed to fetch logs" }, { status: 500 });
  }
}
