/**
 * GET /api/admin/coach-portal/lessons
 * Returns lessons for the authenticated coach (staff JWT).
 * Supports ?from=&to= date filters.
 */
import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  let auth;
  try {
    auth = requireStaff(request.headers);
  } catch {
    return error("Authentication required", 401);
  }

  const sp = request.nextUrl.searchParams;
  const fromStr = sp.get("from");
  const toStr = sp.get("to");

  const where: Record<string, unknown> = { coachId: auth.id };

  if (fromStr || toStr) {
    const dateFilter: Record<string, Date> = {};
    if (fromStr) {
      const from = new Date(fromStr);
      from.setHours(0, 0, 0, 0);
      dateFilter.gte = from;
    }
    if (toStr) {
      const to = new Date(toStr);
      to.setHours(23, 59, 59, 999);
      dateFilter.lte = to;
    }
    where.startTime = dateFilter;
  }

  const lessons = await prisma.coachLesson.findMany({
    where,
    include: {
      player: { select: { id: true, name: true, avatarPhotoPath: true } },
      package: { select: { id: true, name: true, lessonType: true, durationMin: true } },
      court: { select: { id: true, label: true } },
    },
    orderBy: { startTime: "asc" },
  });

  return json(lessons);
}
