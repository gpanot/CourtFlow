import { NextRequest } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requirePortalAuth } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

const AVATARS_DIR = path.join(process.cwd(), "uploads", "players", "avatars");
const MAX_SIZE = 500 * 1024; // 500KB — client sends pre-compressed 500×500 JPEG

export async function POST(request: NextRequest) {
  try {
    const { playerId } = await requirePortalAuth(request);

    const formData = await request.formData();
    const file = formData.get("avatar") as File | null;
    if (!file || file.size === 0) return error("No avatar file provided", 400);

    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length > MAX_SIZE) {
      return error(`File too large (${Math.round(buf.length / 1024)}KB). Max ${MAX_SIZE / 1024}KB.`, 400);
    }

    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const filename = `${playerId}.${ext}`;

    await mkdir(AVATARS_DIR, { recursive: true });
    await writeFile(path.join(AVATARS_DIR, filename), buf);

    const avatarPhotoPath = `/uploads/players/avatars/${filename}?t=${Date.now()}`;
    await prisma.player.update({
      where: { id: playerId },
      data: { avatarPhotoPath },
    });

    return json({ avatarPhotoPath });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required") return error(msg, 401);
    return error(msg, 500);
  }
}
