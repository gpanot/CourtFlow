/**
 * GET/PUT /api/admin/coach-portal/availability
 * Coach-scoped availability management using staff JWT.
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

  const [availabilities, holidays] = await Promise.all([
    prisma.coachAvailability.findMany({
      where: { coachId: auth.id },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    }),
    prisma.coachHoliday.findMany({
      where: { coachId: auth.id },
      orderBy: { startDate: "asc" },
    }),
  ]);

  return json({ availabilities, holidays });
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
  let auth;
  try {
    auth = requireStaff(request.headers);
  } catch {
    return error("Authentication required", 401);
  }

  const body = (await request.json()) as {
    availabilities: AvailabilitySlot[];
    holidays: HolidayPeriod[];
  };

  await prisma.$transaction([
    prisma.coachAvailability.deleteMany({ where: { coachId: auth.id } }),
    prisma.coachHoliday.deleteMany({ where: { coachId: auth.id } }),
    ...body.availabilities.map((slot) =>
      prisma.coachAvailability.create({
        data: {
          coachId: auth.id,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          enabled: slot.enabled,
        },
      })
    ),
    ...(body.holidays ?? []).map((h) =>
      prisma.coachHoliday.create({
        data: {
          coachId: auth.id,
          startDate: new Date(h.startDate),
          endDate: new Date(h.endDate),
          note: h.note ?? null,
        },
      })
    ),
  ]);

  const [availabilities, holidays] = await Promise.all([
    prisma.coachAvailability.findMany({
      where: { coachId: auth.id },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    }),
    prisma.coachHoliday.findMany({
      where: { coachId: auth.id },
      orderBy: { startDate: "asc" },
    }),
  ]);

  return json({ availabilities, holidays });
}
