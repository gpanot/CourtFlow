import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireManagerOrSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    requireManagerOrSuperAdmin(request.headers);
    const { id } = await params;

    const lesson = await prisma.coachLesson.findUnique({ where: { id } });
    if (!lesson) return error("Lesson not found", 404);
    if (lesson.paymentStatus !== "proof_submitted") {
      return error(`Cannot approve: payment status is "${lesson.paymentStatus}", expected "proof_submitted"`, 400);
    }

    const updated = await prisma.coachLesson.update({
      where: { id },
      data: {
        paymentStatus: "paid",
        paidAt: new Date(),
        paymentMethod: "bank_transfer",
      },
      include: {
        coach: { select: { id: true, name: true } },
        player: { select: { id: true, name: true } },
      },
    });

    return json(updated);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("Unauthorized") || msg.includes("Missing")) return error(msg, 401);
    return error(msg, 500);
  }
}
