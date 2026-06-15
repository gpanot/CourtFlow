import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireManagerOrSuperAdmin } from "@/lib/auth";
import { getAuthorizedVenueIds } from "@/lib/venue-scope";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = requireManagerOrSuperAdmin(request.headers);
    const venueIds = await getAuthorizedVenueIds(auth);

    const since = new Date();
    since.setDate(since.getDate() - 14);

    const [bookings, openPlayRegs, coachLessons] = await Promise.all([
      prisma.booking.findMany({
        where: {
          venueId: { in: venueIds },
          status: { in: ["confirmed", "completed"] },
          paymentStatus: { in: ["paid", "proof_submitted"] },
          createdAt: { gte: since },
        },
        select: {
          id: true,
          venueId: true,
          date: true,
          startTime: true,
          paymentStatus: true,
          player: { select: { name: true } },
          court: { select: { label: true } },
          venue: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.openPlayRegistration.findMany({
        where: {
          venueId: { in: venueIds },
          status: "confirmed",
          paymentStatus: { in: ["paid", "proof_submitted"] },
          createdAt: { gte: since },
        },
        select: {
          id: true,
          venueId: true,
          date: true,
          startTime: true,
          scheduleEntryId: true,
          paymentStatus: true,
          player: { select: { name: true } },
          venue: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.coachLesson.findMany({
        where: {
          venueId: { in: venueIds },
          status: { in: ["confirmed", "completed"] },
          paymentStatus: { in: ["paid", "proof_submitted"] },
          createdAt: { gte: since },
        },
        select: {
          id: true,
          venueId: true,
          date: true,
          startTime: true,
          paymentStatus: true,
          player: { select: { name: true } },
          coach: { select: { name: true } },
          venue: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);

    const courtNotifications = bookings.map((b) => ({
      id: b.id,
      type: "booking" as const,
      venueId: b.venueId,
      date: b.date,
      startTime: b.startTime,
      paymentStatus: b.paymentStatus,
      playerName: b.player.name,
      courtLabel: b.court.label,
      venueName: b.venue.name,
    }));

    const openPlayNotifications = openPlayRegs.map((r) => ({
      id: r.id,
      type: "open_play" as const,
      venueId: r.venueId,
      date: r.date,
      startTime: r.startTime,
      paymentStatus: r.paymentStatus,
      playerName: r.player.name,
      courtLabel: null,
      venueName: r.venue.name,
      scheduleEntryId: r.scheduleEntryId,
    }));

    const coachNotifications = coachLessons.map((l) => ({
      id: l.id,
      type: "coach_lesson" as const,
      venueId: l.venueId,
      date: l.date,
      startTime: l.startTime,
      paymentStatus: l.paymentStatus,
      playerName: l.player.name,
      courtLabel: l.coach.name,
      venueName: l.venue.name,
    }));

    return json([...courtNotifications, ...openPlayNotifications, ...coachNotifications]);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("authorization") || msg.includes("token") || msg.includes("access required")) {
      return error(msg, 401);
    }
    return error(msg, 500);
  }
}
