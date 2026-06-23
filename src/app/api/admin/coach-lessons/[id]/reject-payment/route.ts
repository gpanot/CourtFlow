import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireManagerOrSuperAdmin } from "@/lib/auth";
import { buildLessonEmailContext, sendLessonEventEmails } from "@/lib/email/send";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireManagerOrSuperAdmin(request.headers);
    const { id } = await params;
    const { reason } = await parseBody<{ reason?: string }>(request);

    const lesson = await prisma.coachLesson.findUnique({ where: { id } });
    if (!lesson) return error("Lesson not found", 404);
    if (lesson.paymentStatus !== "proof_submitted") {
      return error(`Cannot reject: payment status is "${lesson.paymentStatus}", expected "proof_submitted"`, 400);
    }

    const updated = await prisma.coachLesson.update({
      where: { id },
      data: {
        paymentStatus: "rejected",
        paidAt: null,
        status: "cancelled",
        rejectedAt: new Date(),
        rejectedBy: auth.id,
        rejectionReason: reason ?? null,
        cancelledAt: new Date(),
      },
      include: {
        coach: { select: { id: true, name: true } },
        player: { select: { id: true, name: true, email: true } },
      },
    });

    const ctx = await buildLessonEmailContext(id);
    if (ctx) {
      void sendLessonEventEmails(
        { ...ctx, details: { ...ctx.details, rejectionReason: reason } },
        "rejected"
      );
    }

    return json(updated);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("Unauthorized") || msg.includes("Missing")) return error(msg, 401);
    return error(msg, 500);
  }
}
