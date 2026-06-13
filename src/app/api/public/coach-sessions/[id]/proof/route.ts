import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requirePortalAuth } from "@/lib/portal-auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { playerId } = await requirePortalAuth();
    const { id } = await params;
    const body = await request.json();
    const { proofUrl } = body as { proofUrl: string };

    const lesson = await prisma.coachLesson.findFirst({
      where: { id, playerId, paymentStatus: "pending" },
    });
    if (!lesson) return error("Session not found or not pending payment", 404);

    await prisma.coachLesson.update({
      where: { id },
      data: { paymentStatus: "proof_submitted", proofUrl },
    });

    return json({ success: true });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required") return error(msg, 401);
    return error(msg, 500);
  }
}
