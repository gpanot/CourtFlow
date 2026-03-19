import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ coachId: string }> }
) {
  try {
    requireSuperAdmin(request.headers);
    const { coachId } = await params;
    const dateStr = request.nextUrl.searchParams.get("date");
    const venueId = request.nextUrl.searchParams.get("venueId");

    if (!dateStr || !venueId) {
      return error("date and venueId are required", 400);
    }

    const coach = await prisma.staffMember.findUnique({
      where: { id: coachId, isCoach: true },
    });
    if (!coach) return error("Coach not found", 404);

    const date = new Date(dateStr);
    date.setHours(0, 0, 0, 0);
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);

    const lessons = await prisma.coachLesson.findMany({
      where: {
        coachId,
        date,
        status: { in: ["confirmed", "completed"] },
      },
      select: { startTime: true, endTime: true, courtId: true },
    });

    const sessions = await prisma.session.findMany({
      where: {
        venueId,
        status: "open",
      },
      select: { id: true },
    });

    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: { settings: true },
    });

    const vs = venue?.settings as Record<string, unknown> | undefined;
    const bookingConfig = (vs?.bookingConfig as { openTime?: number; closeTime?: number }) || {};
    const openTime = bookingConfig.openTime ?? 6;
    const closeTime = bookingConfig.closeTime ?? 22;

    const slots: { hour: number; available: boolean; reason?: string }[] = [];
    for (let h = openTime; h < closeTime; h++) {
      const slotStart = new Date(date);
      slotStart.setHours(h, 0, 0, 0);
      const slotEnd = new Date(date);
      slotEnd.setHours(h + 1, 0, 0, 0);

      const conflict = lessons.find(
        (l) =>
          slotStart.getTime() < l.endTime.getTime() &&
          slotEnd.getTime() > l.startTime.getTime()
      );

      slots.push({
        hour: h,
        available: !conflict,
        ...(conflict ? { reason: "lesson_booked" } : {}),
      });
    }

    return json({
      coachId,
      date: dateStr,
      activeSessions: sessions.length,
      slots,
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
