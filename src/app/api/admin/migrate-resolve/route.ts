/**
 * TEMPORARY — delete after use.
 * Resolves a failed migration from inside Railway's network where
 * postgres.railway.internal is reachable.
 * Protected by ADMIN_SECRET env var.
 */
import { NextRequest } from "next/server";
import { execSync } from "child_process";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-admin-secret");
  if (!secret || secret !== process.env.JWT_SECRET) {
    return new Response("Forbidden", { status: 403 });
  }

  const { migration, action } = await request.json() as { migration: string; action: "rolled-back" | "applied" };
  if (!migration || !action) {
    return new Response("Missing migration or action", { status: 400 });
  }

  try {
    const flag = action === "applied" ? "--applied" : "--rolled-back";
    const result = execSync(
      `npx prisma migrate resolve ${flag} ${migration}`,
      { encoding: "utf8", timeout: 30000 }
    );
    return Response.json({ ok: true, output: result });
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    return Response.json({ ok: false, error: err.stderr || err.stdout || err.message }, { status: 500 });
  }
}
