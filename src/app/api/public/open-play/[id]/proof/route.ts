import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requirePortalAuth } from "@/lib/portal-auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "proofs");

export const dynamic = "force-dynamic";

/** POST /api/public/open-play/[id]/proof — Submit payment proof */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { playerId } = await requirePortalAuth(request);
    const { id } = await params;

    const reg = await prisma.openPlayRegistration.findFirst({
      where: { id, playerId, paymentStatus: "pending" },
    });
    if (!reg) return error("Registration not found or not pending payment", 404);

    const contentType = request.headers.get("content-type") || "";
    let proofUrl: string;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("proof") as File | null;
      if (!file || file.size === 0) return error("No proof image provided", 400);

      if (file.size > 10 * 1024 * 1024) return error("File too large (max 10MB)", 400);

      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const allowed = ["jpg", "jpeg", "png", "webp", "heic"];
      const safeExt = allowed.includes(ext) ? ext : "jpg";

      const filename = `op-${id}-${Date.now()}.${safeExt}`;
      await mkdir(UPLOAD_DIR, { recursive: true });

      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(path.join(UPLOAD_DIR, filename), buffer);
      proofUrl = `/uploads/proofs/${filename}`;
    } else {
      const body = await request.json();
      proofUrl = (body as { proofUrl?: string }).proofUrl || "pending_proof";
    }

    await prisma.openPlayRegistration.update({
      where: { id },
      data: {
        paymentStatus: "proof_submitted",
        paymentProofUrl: proofUrl,
        holdExpiresAt: null,
      },
    });

    return json({ success: true, proofUrl });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required") return error(msg, 401);
    return error(msg, 500);
  }
}
