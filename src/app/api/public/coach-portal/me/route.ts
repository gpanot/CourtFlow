import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requirePortalAuth } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { coachStaffId } = await requirePortalAuth(request);
    if (!coachStaffId) return error("Not a coach account", 403);

    const coach = await prisma.staffMember.findUnique({
      where: { id: coachStaffId },
      select: {
        name: true,
        calendarSyncEnabled: true,
        googleCalendarId: true,
      },
    });

    if (!coach) return error("Coach not found", 404);

    return json(coach);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required") return error(msg, 401);
    return error(msg, 500);
  }
}
