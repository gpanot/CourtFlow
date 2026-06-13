import { NextRequest } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireManagerOrSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
const COACHES_DIR = path.join(process.cwd(), "uploads", "coaches", "photos");
const MAX_SIZE = 500 * 1024; // 500 KB

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ coachId: string }> }
) {
  try {
    requireManagerOrSuperAdmin(request.headers);
    const { coachId } = await params;

    const coach = await prisma.staffMember.findUnique({
      where: { id: coachId, isCoach: true },
    });
    if (!coach) return error("Coach not found", 404);

    const formData = await request.formData();
    const file = formData.get("photo") as File | null;
    if (!file) return error("No photo file provided", 400);

    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length > MAX_SIZE) {
      return error(`File too large (${Math.round(buf.length / 1024)}KB). Max ${MAX_SIZE / 1024}KB.`, 400);
    }

    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const filename = `${coachId}.${ext}`;

    await mkdir(COACHES_DIR, { recursive: true });
    await writeFile(path.join(COACHES_DIR, filename), buf);

    const coachPhoto = `/uploads/coaches/photos/${filename}?t=${Date.now()}`;
    await prisma.staffMember.update({
      where: { id: coachId },
      data: { coachPhoto },
    });

    return json({ coachPhoto });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
