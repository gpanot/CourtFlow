/**
 * POST /api/public/coach-sessions/[id]/cancel
 *
 * Allows a student to self-cancel a lesson if more than 48 hours remain.
 * - Credit-based lessons: refunds 1 credit and creates a CreditTransaction audit row.
 * - One-time paid lessons: no refund.
 * - Fires emails to student, coach, and staff.
 * - Returns 403 if within 48h of start (student must call staff).
 */
import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requirePortalAuth } from "@/lib/portal-auth";
import { buildLessonEmailContext, sendLessonEventEmails } from "@/lib/email/send";
import { deleteCalendarEvent } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

const CANCEL_WINDOW_HOURS = 48;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { playerId } = await requirePortalAuth(request);
    const { id } = await params;

    const lesson = await prisma.coachLesson.findFirst({
      where: { id, playerId },
      select: {
        id: true,
        status: true,
        paymentMethod: true,
        startTime: true,
        coachId: true,
        googleEventId: true,
        coach: {
          select: {
            googleRefreshToken: true,
            googleCalendarId: true,
            calendarSyncEnabled: true,
          },
        },
      },
    });

    if (!lesson) return error("Lesson not found", 404);

    if (lesson.status === "cancelled") {
      return error("Lesson is already cancelled", 400);
    }

    // 48-hour policy check
    const hoursUntilStart =
      (lesson.startTime.getTime() - Date.now()) / (1000 * 60 * 60);

    if (hoursUntilStart < CANCEL_WINDOW_HOURS) {
      return json(
        {
          error: "Cannot self-cancel within 48 hours of the lesson. Please contact staff.",
          hoursUntilStart: Math.max(0, hoursUntilStart),
        },
        403
      );
    }

    // Credit refund logic
    if (lesson.paymentMethod === "credit") {
      // Find the most recent paid credit for this player+coach pair that still has capacity
      const credit = await prisma.playerCoachCredit.findFirst({
        where: {
          playerId,
          coachId: lesson.coachId,
          paymentStatus: "paid",
          expiresAt: { gt: new Date() },
          usedSessions: { gt: 0 },
        },
        orderBy: { createdAt: "desc" },
      });

      if (credit) {
        await prisma.$transaction([
          prisma.playerCoachCredit.update({
            where: { id: credit.id },
            data: { usedSessions: { decrement: 1 } },
          }),
          prisma.creditTransaction.create({
            data: {
              creditId: credit.id,
              lessonId: lesson.id,
              amount: 1,
              reason: "cancelled_refund",
            },
          }),
        ]);
      }
    }

    const cancelled = await prisma.coachLesson.update({
      where: { id },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
      },
    });

    // Delete the Google Calendar event using the stored event ID
    if (
      lesson.coach.calendarSyncEnabled &&
      lesson.coach.googleRefreshToken &&
      lesson.coach.googleCalendarId &&
      lesson.googleEventId
    ) {
      void deleteCalendarEvent(
        lesson.coach.googleRefreshToken,
        lesson.coach.googleCalendarId,
        lesson.googleEventId
      ).catch((err) =>
        console.error("[cancel] Google Calendar event deletion failed:", err)
      );
    }

    const ctx = await buildLessonEmailContext(id);
    if (ctx) {
      void sendLessonEventEmails(ctx, "cancelled");
    }

    return json({ success: true, lesson: cancelled });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required") return error(msg, 401);
    return error(msg, 500);
  }
}
