import { NextRequest } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireAdminAccess } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const OUTPUT_SIZE = 800;
const UPLOAD_DIR = path.join(process.cwd(), "uploads", "program-passes");

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminAccess(request.headers);
    const { id } = await params;

    const formData = await request.formData() as unknown as FormData;
    const file = formData.get("image") as File | null;
    if (!file) return error("No file provided", 400);
    if (!ALLOWED_TYPES.includes(file.type)) {
      return error("Invalid file type. Use PNG, JPEG, or WebP.", 400);
    }
    if (file.size > MAX_SIZE) return error("File too large. Max 5 MB.", 400);

    const passType = await prisma.programPassType.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!passType) return error("Pass type not found", 404);

    const raw = Buffer.from(await file.arrayBuffer());
    const webp = await sharp(raw)
      .resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: "inside" })
      .webp({ quality: 80 })
      .toBuffer();

    await mkdir(UPLOAD_DIR, { recursive: true });
    const filename = `${id}-${Date.now()}.webp`;
    await writeFile(path.join(UPLOAD_DIR, filename), webp);

    const imageUrl = `/uploads/program-passes/${filename}`;

    await prisma.programPassType.update({
      where: { id },
      data: { imageUrl },
    });

    return json({ imageUrl });
  } catch (e) {
    console.error("[program-pass image upload]", e);
    return error((e as Error).message, 500);
  }
}
