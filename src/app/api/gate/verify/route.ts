import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const SITE_PASSWORD = process.env.SITE_PASSWORD || "CourtFlow2026!";
const COOKIE_NAME = "cf-site-access";
const TOKEN_VALUE = "granted";

async function ensureTable() {
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
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function maskPassword(pw: string): string {
  if (!pw) return "(empty)";
  if (pw.length <= 3) return "***";
  return pw[0] + "*".repeat(pw.length - 2) + pw[pw.length - 1];
}

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent") || null;
  const success = password === SITE_PASSWORD;

  try {
    await ensureTable();
    await prisma.$executeRawUnsafe(
      `INSERT INTO gate_attempts (ip, user_agent, success, attempted_password) VALUES ($1, $2, $3, $4)`,
      ip,
      userAgent,
      success,
      success ? null : maskPassword(password),
    );
  } catch {
    // Don't block login if logging fails
  }

  if (!success) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, TOKEN_VALUE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
