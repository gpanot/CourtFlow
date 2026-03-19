import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    requireSuperAdmin(request.headers);

    const venueId = request.nextUrl.searchParams.get("venueId");
    const dateStr = request.nextUrl.searchParams.get("date");
    const coachId = request.nextUrl.searchParams.get("coachId");
    const playerId = request.nextUrl.searchParams.get("playerId");

    const where: Record<string, unknown> = {};
    if (venueId) where.venueId = venueId;
    if (coachId) where.coachId = coachId;
    if (playerId) where.playerId = playerId;
    if (dateStr) {
      const date = new Date(dateStr);
      date.setHours(0, 0, 0, 0);
      where.date = date;
    }

    const lessons = await prisma.coachLesson.findMany({
      where,
      include: {
        coach: { select: { id: true, name: true, coachPhoto: true } },
        player: { select: { id: true, name: true, phone: true } },
        court: { select: { id: true, label: true } },
        package: { select: { id: true, name: true, lessonType: true, durationMin: true } },
      },
      orderBy: { startTime: "asc" },
    });

    return json(lessons);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    requireSuperAdmin(request.headers);

    const body = await parseBody<{
      venueId: string;
      coachId: string;
      playerId: string;
      packageId: string;
      courtId?: string;
      date: string;
      startTime: string;
      endTime?: string;
      note?: string;
    }>(request);

    if (!body.venueId || !body.coachId || !body.playerId || !body.packageId || !body.date || !body.startTime) {
      return error("venueId, coachId, playerId, packageId, date, and startTime are required", 400);
    }

    const coach = await prisma.staffMember.findUnique({
      where: { id: body.coachId, isCoach: true },
    });
    if (!coach) return error("Coach not found", 404);

    const pkg = await prisma.coachPackage.findUnique({
      where: { id: body.packageId },
    });
    if (!pkg) return error("Package not found", 404);

    const player = await prisma.player.findUnique({
      where: { id: body.playerId },
    });
    if (!player) return error("Player not found", 404);

    if (body.courtId) {
      const court = await prisma.court.findUnique({
        where: { id: body.courtId },
      });
      if (!court) return error("Court not found", 404);
    }

    const date = new Date(body.date);
    date.setHours(0, 0, 0, 0);

    const startTime = new Date(body.startTime);
    const endTime = body.endTime
      ? new Date(body.endTime)
      : new Date(startTime.getTime() + pkg.durationMin * 60 * 1000);

    const conflict = await prisma.coachLesson.findFirst({
      where: {
        coachId: body.coachId,
        date,
        status: { in: ["confirmed", "completed"] },
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    });
    if (conflict) return error("Coach has a conflicting lesson at this time", 409);

    if (body.courtId) {
      const courtConflict = await prisma.coachLesson.findFirst({
        where: {
          courtId: body.courtId,
          date,
          status: { in: ["confirmed", "completed"] },
          startTime: { lt: endTime },
          endTime: { gt: startTime },
        },
      });
      if (courtConflict) return error("Court is already booked for a lesson at this time", 409);

      const bookingConflict = await prisma.booking.findFirst({
        where: {
          courtId: body.courtId,
          date,
          status: { in: ["confirmed", "completed"] },
          startTime: { lt: endTime },
          endTime: { gt: startTime },
        },
      });
      if (bookingConflict) return error("Court is already booked at this time", 409);
    }

    const durationMs = endTime.getTime() - startTime.getTime();
    const durationMin = durationMs / (60 * 1000);
    const priceInCents = Math.round((pkg.priceInCents / pkg.durationMin) * durationMin);

    const lesson = await prisma.coachLesson.create({
      data: {
        venueId: body.venueId,
        coachId: body.coachId,
        playerId: body.playerId,
        packageId: body.packageId,
        courtId: body.courtId || null,
        date,
        startTime,
        endTime,
        priceInCents,
        note: body.note || null,
      },
      include: {
        coach: { select: { id: true, name: true } },
        player: { select: { id: true, name: true } },
        court: { select: { id: true, label: true } },
        package: { select: { id: true, name: true, lessonType: true, durationMin: true } },
      },
    });

    return json(lesson, 201);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
