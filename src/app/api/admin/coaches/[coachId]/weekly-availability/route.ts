import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireManagerOrSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ coachId: string }> }
) {
  try {
    requireManagerOrSuperAdmin(request.headers);
    const { coachId } = await params;

    const coach = await prisma.staffMember.findUnique({
      where: { id: coachId, isCoach: true },
      select: { id: true },
    });
    if (!coach) return error("Coach not found", 404);

    const [availabilities, holidays] = await Promise.all([
      prisma.coachAvailability.findMany({
        where: { coachId },
        orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      }),
      prisma.coachHoliday.findMany({
        where: { coachId },
        orderBy: { startDate: "asc" },
      }),
    ]);

    return json({ availabilities, holidays });
  } catch (e) {
    return error((e as Error).message, 500);
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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ coachId: string }> }
) {
  try {
    requireManagerOrSuperAdmin(request.headers);
    const { coachId } = await params;

    const body = await parseBody<{
      availabilities: AvailabilitySlot[];
      holidays: HolidayPeriod[];
    }>(request);

    const coach = await prisma.staffMember.findUnique({
      where: { id: coachId, isCoach: true },
      select: { id: true },
    });
    if (!coach) return error("Coach not found", 404);

    await prisma.$transaction([
      prisma.coachAvailability.deleteMany({ where: { coachId } }),
      prisma.coachHoliday.deleteMany({ where: { coachId } }),
      ...body.availabilities.map((slot) =>
        prisma.coachAvailability.create({
          data: {
            coachId,
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
            coachId,
            startDate: new Date(h.startDate),
            endDate: new Date(h.endDate),
            note: h.note ?? null,
          },
        })
      ),
    ]);

    const [availabilities, holidays] = await Promise.all([
      prisma.coachAvailability.findMany({
        where: { coachId },
        orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      }),
      prisma.coachHoliday.findMany({
        where: { coachId },
        orderBy: { startDate: "asc" },
      }),
    ]);

    return json({ availabilities, holidays });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
