import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { requireManagerOrSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

/**
 * POST /api/admin/manager/billing/upload-proof
 * Manager-scoped endpoint to upload payment proof (image or PDF).
 */
export async function POST(request: NextRequest) {
  try {
    requireManagerOrSuperAdmin(request.headers);

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Only PDF, JPEG, PNG, and WebP are allowed" },
        { status: 400 }
      );
    }

    const ext = file.name.split(".").pop() || "jpg";
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads", "payment-proofs");
    await mkdir(uploadDir, { recursive: true });
    const dest = path.join(uploadDir, filename);

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(dest, buffer);

    return NextResponse.json({ url: `/uploads/payment-proofs/${filename}` });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status =
      message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
