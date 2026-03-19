import { NextRequest } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";
import { json, error } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function POST(request: NextRequest) {
  try {
    requireSuperAdmin(request.headers);

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) return error("No file provided", 400);
    if (file.size > MAX_SIZE) return error("File too large (max 5 MB)", 400);
    if (!ALLOWED_TYPES.includes(file.type)) return error("Only JPEG, PNG, WebP, and GIF are allowed", 400);

    const ext = file.name.split(".").pop() || "jpg";
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const dest = path.join(process.cwd(), "public", "uploads", "payment-proofs", filename);

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(dest, buffer);

    return json({ url: `/uploads/payment-proofs/${filename}` });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
