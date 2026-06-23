/**
 * POST /api/admin/coach-portal/photo
 * Coach uploads their own profile photo using a staff JWT.
 */
import { NextRequest } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

const COACHES_DIR = path.join(process.cwd(), "uploads", "coaches", "photos");
const MAX_SIZE = 500 * 1024;

export async function POST(request: NextRequest) {
  let auth;
  try { auth = requireStaff(request.headers); } catch { return error("Authentication required", 401); }

  const coach = await prisma.staffMember.findUnique({ where: { id: auth.id, isCoach: true }, select: { id: true } });
  if (!coach) return error("Coach not found", 404);

  const formData = await request.formData();
  const file = formData.get("photo") as File | null;
  if (!file) return error("No photo file provided", 400);

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > MAX_SIZE) return error(`File too large. Max 500KB.`, 400);

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const filename = `${auth.id}.${ext}`;

  await mkdir(COACHES_DIR, { recursive: true });
  await writeFile(path.join(COACHES_DIR, filename), buf);

  const coachPhoto = `/uploads/coaches/photos/${filename}?t=${Date.now()}`;
  await prisma.staffMember.update({ where: { id: auth.id }, data: { coachPhoto } });

  return json({ coachPhoto });
}
