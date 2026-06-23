/**
 * GET/PUT /api/public/coach-portal/availability
 *
 * Coach-scoped version of the admin weekly-availability route.
 * Validates that the authed player's coachStaffId matches before writing.
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

    const [availabilities, holidays] = await Promise.all([
      prisma.coachAvailability.findMany({
        where: { coachId: coachStaffId },
        orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      }),
      prisma.coachHoliday.findMany({
        where: { coachId: coachStaffId },
        orderBy: { startDate: "asc" },
      }),
    ]);

    return json({ availabilities, holidays });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required") return error(msg, 401);
    return error(msg, 500);
  }
}

interface AvailabilitySlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  enabled: boolean;
}

interface HolidayPeriod {
  startDate: string;
  endDate: string;
  note?: string | null;
}

export async function PUT(request: NextRequest) {
  try {
    const { coachStaffId } = await requirePortalAuth(request);
    if (!coachStaffId) return error("Not a coach account", 403);

    const body = (await request.json()) as {
      availabilities: AvailabilitySlot[];
      holidays: HolidayPeriod[];
    };

    await prisma.$transaction([
      prisma.coachAvailability.deleteMany({ where: { coachId: coachStaffId } }),
      prisma.coachHoliday.deleteMany({ where: { coachId: coachStaffId } }),
      ...body.availabilities.map((slot) =>
        prisma.coachAvailability.create({
          data: {
            coachId: coachStaffId,
            dayOfWeek: slot.dayOfWeek,
            startTime: slot.startTime,
            endTime: slot.endTime,
            enabled: slot.enabled,
          },
        })
      ),
      ...body.holidays.map((h) =>
        prisma.coachHoliday.create({
          data: {
            coachId: coachStaffId,
            startDate: new Date(h.startDate),
            endDate: new Date(h.endDate),
            note: h.note ?? null,
          },
        })
      ),
    ]);

    const [availabilities, holidays] = await Promise.all([
      prisma.coachAvailability.findMany({
        where: { coachId: coachStaffId },
        orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      }),
      prisma.coachHoliday.findMany({
        where: { coachId: coachStaffId },
        orderBy: { startDate: "asc" },
      }),
    ]);

    return json({ availabilities, holidays });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required") return error(msg, 401);
    return error(msg, 500);
  }
}
