import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requirePortalAuth } from "@/lib/portal-auth";
import { toDateKey } from "@/lib/date";

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
