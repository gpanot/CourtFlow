import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/program-passes/class-instances?venueId=&date=YYYY-MM-DD
 * Returns ClassInstance rows for a venue on the given date (defaults to today).
 */
export async function GET(request: NextRequest) {
  try {
    requireSuperAdmin(request.headers);
    const venueId = request.nextUrl.searchParams.get("venueId");
    if (!venueId) return error("venueId is required");

    const dateParam = request.nextUrl.searchParams.get("date");
    const dateStr = dateParam ?? new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD in local tz

    const dayStart = new Date(dateStr + "T00:00:00+07:00");
    const dayEnd = new Date(dateStr + "T23:59:59+07:00");

    const instances = await prisma.classInstance.findMany({
      where: {
        venueId,
        startAt: { gte: dayStart, lte: dayEnd },
      },
      include: {
        coach: { select: { id: true, name: true } },
        passType: { select: { id: true, name: true } },
        _count: { select: { checkIns: true } },
      },
      orderBy: { startAt: "asc" },
    });

    return json(instances);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
