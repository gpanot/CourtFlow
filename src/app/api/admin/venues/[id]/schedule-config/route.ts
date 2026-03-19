import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody, notFound } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";
import { type ScheduleConfig, DEFAULT_SCHEDULE_CONFIG } from "@/lib/booking";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    requireSuperAdmin(request.headers);
    const { id } = await params;
    const body = await parseBody<ScheduleConfig>(request);

    const venue = await prisma.venue.findUnique({ where: { id } });
    if (!venue) return notFound("Venue not found");

    if (!Array.isArray(body.entries)) {
      return error("entries must be an array", 400);
    }

    for (const entry of body.entries) {
      if (!Array.isArray(entry.daysOfWeek) || entry.daysOfWeek.length === 0) return error("Each entry must have at least one day", 400);
      if (entry.daysOfWeek.some((d: number) => d < 0 || d > 6)) return error("Invalid day of week", 400);
      if (entry.startHour >= entry.endHour) return error("startHour must be before endHour", 400);
      if (!entry.courtIds?.length) return error("Each entry must have at least one court", 400);
      if (!["open_play", "competition"].includes(entry.type)) return error("Invalid type", 400);
    }

    const settings = (venue.settings as Record<string, unknown>) || {};
    const scheduleConfig: ScheduleConfig = {
      ...DEFAULT_SCHEDULE_CONFIG,
      entries: body.entries,
    };

    const updatedSettings = { ...settings, scheduleConfig } as Record<string, unknown>;
    await prisma.venue.update({
      where: { id },
      data: { settings: updatedSettings as never },
    });

    return json({ scheduleConfig, venueId: id });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
