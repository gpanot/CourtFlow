import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requirePortalAuth } from "@/lib/portal-auth";
import { toDateKey } from "@/lib/date";
import { PAYMENT_HOLD_MINUTES } from "@/lib/payment-hold";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { playerId } = await requirePortalAuth(request);
    const { id } = await params;

    const lesson = await prisma.coachLesson.findFirst({
      where: { id, playerId },
      include: {
        coach: { select: { name: true, coachPhoto: true } },
        court: { select: { label: true } },
        package: { select: { name: true } },
      },
    });
    if (!lesson) return error("Session not found", 404);

    return json({ ...lesson, date: toDateKey(lesson.date) });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required") return error(msg, 401);
    return error(msg, 500);
  }
}

/** DELETE /api/public/coach-sessions/[id]
 *  Called by the client pay page when the hold timer expires.
 *  reason=expired_hold → soft-records as cancelled/expired for analytics.
 *  Without reason → hard-delete (player cancelled before paying).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { playerId } = await requirePortalAuth(request);
    const { id } = await params;

    const lesson = await prisma.coachLesson.findFirst({
      where: { id, playerId },
      select: { id: true, paymentStatus: true, status: true, createdAt: true },
    });
    if (!lesson) return error("Session not found", 404);
    if (lesson.status === "cancelled") return error("Already cancelled", 400);

    const reason = request.nextUrl.searchParams.get("reason");

    // Only treat as expired hold if the lesson is still in its pending hold window
    const holdExpiresAt = new Date(
      lesson.createdAt.getTime() + PAYMENT_HOLD_MINUTES * 60 * 1000
    );
    const isInHoldWindow =
      lesson.paymentStatus === "pending" && holdExpiresAt > new Date(0);

    if (reason === "expired_hold" && isInHoldWindow) {
      await prisma.coachLesson.update({
        where: { id },
        data: { status: "cancelled", paymentStatus: "expired", cancelledAt: new Date() },
      });
      return json({ success: true });
    }

    // Manual cancel by player during hold window — just delete to free the slot
    if (lesson.paymentStatus === "pending") {
      await prisma.coachLesson.delete({ where: { id } });
      return json({ success: true });
    }

    // Lesson was already paid / submitted — require the full cancel flow
    return error("Use the cancel endpoint for confirmed lessons", 400);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required") return error(msg, 401);
    return error(msg, 500);
  }
}
