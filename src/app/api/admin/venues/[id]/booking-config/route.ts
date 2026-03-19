import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody, notFound } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";
import { DEFAULT_BOOKING_CONFIG, type BookingConfig } from "@/lib/booking";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    requireSuperAdmin(request.headers);
    const { id } = await params;
    const body = await parseBody<Partial<BookingConfig>>(request);

    const venue = await prisma.venue.findUnique({ where: { id } });
    if (!venue) return notFound("Venue not found");

    const settings = (venue.settings as Record<string, unknown>) || {};
    const currentConfig = (settings.bookingConfig as Partial<BookingConfig>) || {};

    const updatedConfig: BookingConfig = {
      ...DEFAULT_BOOKING_CONFIG,
      ...currentConfig,
      ...body,
    };

    if (updatedConfig.bookingStartHour >= updatedConfig.bookingEndHour) {
      return error("Start hour must be before end hour", 400);
    }

    const updatedSettings = { ...settings, bookingConfig: updatedConfig } as Record<string, unknown>;

    const updated = await prisma.venue.update({
      where: { id },
      data: { settings: updatedSettings as never },
    });

    return json({ bookingConfig: updatedConfig, venueId: updated.id });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
