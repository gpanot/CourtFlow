import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requirePortalAuth } from "@/lib/portal-auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "proofs");

/**
 * POST /api/public/program-passes/[id]/proof
 * Upload a payment proof image for a program pass payment.
 * Mirrors the coach-sessions proof upload route.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { playerId } = await requirePortalAuth(request);
    const { id } = await params;

    const pass = await prisma.programPass.findFirst({
      where: { id, playerId },
      include: {
        payments: {
          where: { status: "UNPAID" },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!pass) return error("Program pass not found", 404);
    const payment = pass.payments[0];
    if (!payment) return error("No pending payment found for this pass", 400);

    const contentType = request.headers.get("content-type") || "";
    let proofUrl: string;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData() as unknown as FormData;
      const file = formData.get("proof") as File | null;
      if (!file || file.size === 0) return error("No proof image provided", 400);

      const maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) return error("File too large (max 10MB)", 400);

      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const allowed = ["jpg", "jpeg", "png", "webp", "heic"];
      const safeExt = allowed.includes(ext) ? ext : "jpg";

      const filename = `program-pass-${id}-${Date.now()}.${safeExt}`;
      await mkdir(UPLOAD_DIR, { recursive: true });
      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(path.join(UPLOAD_DIR, filename), buffer);
      proofUrl = `/uploads/proofs/${filename}`;
    } else {
      const body = await request.json();
      proofUrl = (body as { proofUrl?: string }).proofUrl || "pending_proof";
    }

    // Store proof; staff will review and mark PAID from the admin panel.
    // proofUrl signals that payment evidence has been submitted.
    await prisma.programPassPayment.update({
      where: { id: payment.id },
      data: { proofUrl, paymentMethod: "transfer" },
    });

    return json({ success: true, proofUrl });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required") return error(msg, 401);
    return error(msg, 500);
  }
}
