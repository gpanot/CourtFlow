import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requirePortalAuth } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { coachStaffId } = await requirePortalAuth(request);
    if (!coachStaffId) return error("Not a coach account", 403);

    await prisma.staffMember.update({
      where: { id: coachStaffId },
      data: {
        googleRefreshToken: null,
        googleCalendarId: null,
        calendarSyncEnabled: false,
      },
    });

    return json({ success: true });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required") return error(msg, 401);
    return error(msg, 500);
  }
}
