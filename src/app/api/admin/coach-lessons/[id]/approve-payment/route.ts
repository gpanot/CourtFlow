import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireManagerOrSuperAdmin } from "@/lib/auth";
import { buildLessonEmailContext, sendLessonEventEmails } from "@/lib/email/send";
import { createCalendarEvent } from "@/lib/google-calendar";

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
        status: "confirmed",
      },
      include: {
        coach: {
          select: {
            id: true,
            name: true,
            googleRefreshToken: true,
            googleCalendarId: true,
            calendarSyncEnabled: true,
          },
        },
        player: { select: { id: true, name: true, email: true } },
      },
    });

    const ctx = await buildLessonEmailContext(id);
    if (ctx) {
      void sendLessonEventEmails(ctx, "approved");
    }

    // Google Calendar: create event and persist the event ID for later deletion
    if (
      updated.coach.calendarSyncEnabled &&
      updated.coach.googleRefreshToken &&
      updated.coach.googleCalendarId
    ) {
      createCalendarEvent(
        updated.coach.googleRefreshToken,
        updated.coach.googleCalendarId,
        updated
      )
        .then((googleEventId) =>
          prisma.coachLesson.update({
            where: { id },
            data: { googleEventId },
          })
        )
        .catch((err) =>
          console.error("[approve-payment] Calendar event creation failed:", err)
        );
    }

    return json(updated);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("Unauthorized") || msg.includes("Missing")) return error(msg, 401);
    return error(msg, 500);
  }
}
