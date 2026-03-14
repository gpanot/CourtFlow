import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";
import { mkdir, unlink } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { emitToVenue } from "@/lib/socket-server";

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "venues");
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB raw input
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const OUTPUT_SIZE = 512;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  try {
    const auth = requireSuperAdmin(request.headers);
    const { venueId } = await params;

    const owned = await prisma.venue.count({
      where: { id: venueId, staff: { some: { id: auth.id } } },
    });
    if (!owned) return error("You don't own this venue", 403);

    const formData = await request.formData();
    const file = formData.get("logo") as File | null;
    if (!file) return error("No file provided", 400);
    if (!ALLOWED_TYPES.includes(file.type)) return error("Invalid file type. Use PNG, JPEG, WebP, or SVG.", 400);
    if (file.size > MAX_SIZE) return error("File too large. Max 5 MB.", 400);

    await mkdir(UPLOAD_DIR, { recursive: true });
    const raw = Buffer.from(await file.arrayBuffer());

    const filename = `${venueId}.webp`;
    await sharp(raw)
      .resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: "cover" })
      .webp({ quality: 80 })
      .toFile(path.join(UPLOAD_DIR, filename));

    const logoUrl = `/uploads/venues/${filename}?t=${Date.now()}`;
    const venue = await prisma.venue.update({
      where: { id: venueId },
      data: { logoUrl },
    });
    emitToVenue(venueId, "venue:updated", { id: venueId, logoUrl: venue.logoUrl, tvText: venue.tvText });

    return json({ logoUrl });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  try {
    const auth = requireSuperAdmin(request.headers);
    const { venueId } = await params;

    const owned = await prisma.venue.count({
      where: { id: venueId, staff: { some: { id: auth.id } } },
    });
    if (!owned) return error("You don't own this venue", 403);

    try { await unlink(path.join(UPLOAD_DIR, `${venueId}.webp`)); } catch {}

    const venue = await prisma.venue.update({
      where: { id: venueId },
      data: { logoUrl: null },
    });
    emitToVenue(venueId, "venue:updated", { id: venueId, logoUrl: venue.logoUrl, tvText: venue.tvText });

    return json({ success: true });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
