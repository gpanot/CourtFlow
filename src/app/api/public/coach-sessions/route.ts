import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requirePortalAuth } from "@/lib/portal-auth";
import { getPortalVenueId } from "@/lib/venue-config";
import { createCoachLesson, CoachLessonError } from "@/lib/coach-lesson";
import { toDateKey } from "@/lib/date";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { playerId } = await requirePortalAuth(request);
    const body = await request.json();
    const {
      coachId,
      packageId,
      date,
      startTime,
      slotCount,
      payWithCredit,
      creditId,
      venueId: bodyVenueId,
      playerCount,
    } = body as {
      coachId: string;
      packageId: string;
      date: string;
      startTime: string;
      slotCount?: number;
      payWithCredit?: boolean;
      creditId?: string;
      venueId?: string;
      playerCount?: number;
    };
    const venueId = bodyVenueId || getPortalVenueId();

    const result = await createCoachLesson(playerId, {
      coachId,
      packageId,
      date,
      startTime,
      slotCount,
      payWithCredit,
      creditId,
      venueId,
      playerCount,
    });

    const lesson = result.lesson as { date?: string; startTime?: unknown };
    console.log(`[coach-session:create] dateReceived="${date}" startTimeReceived="${startTime}" → stored date="${lesson.date}" startTime="${lesson.startTime}"`);

    return json(result, 201);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required") return error(msg, 401);
    if (e instanceof CoachLessonError) {
      if (e.statusCode === 409 && e.extra) {
        return json({ error: e.message, ...e.extra }, 409);
      }
      return error(e.message, e.statusCode);
    }
    if (msg === "No credits remaining or credit expired") return error(msg, 400);
    return error(msg, 500);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { playerId } = await requirePortalAuth(request);

    const lessons = await prisma.coachLesson.findMany({
      where: { playerId },
      include: {
        coach: { select: { name: true, coachPhoto: true } },
        package: { select: { name: true } },
        court: { select: { label: true } },
      },
      orderBy: { startTime: "desc" },
    });

    return json(lessons.map((l) => ({ ...l, date: toDateKey(l.date) })));
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required") return error(msg, 401);
    return error(msg, 500);
  }
}
