/**
 * GET /api/public/coach-portal/lessons
 * Returns all lessons for the logged-in coach (view-only, no approve/reject).
 */
import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requirePortalAuth } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { coachStaffId } = await requirePortalAuth(request);
    if (!coachStaffId) return error("Not a coach account", 403);

    const lessons = await prisma.coachLesson.findMany({
      where: { coachId: coachStaffId },
      include: {
        player: { select: { name: true, avatarPhotoPath: true } },
        package: { select: { name: true, lessonType: true } },
        court: { select: { label: true } },
      },
      orderBy: { startTime: "desc" },
    });

    return json(lessons);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required") return error(msg, 401);
    return error(msg, 500);
  }
}
