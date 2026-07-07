import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody, notFound } from "@/lib/api-helpers";
import { requireAdminAccess } from "@/lib/auth";
import { assertVenueAccess } from "@/lib/venue-scope";
import { DEFAULT_BOOKING_CONFIG, type BookingConfig } from "@/lib/booking";

export const dynamic = "force-dynamic";
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await await requireAdminAccess(request.headers);
    const { id } = await params;
    await assertVenueAccess(auth, id);
    const body = await parseBody<Partial<BookingConfig>>(request);

    const venue = await prisma.venue.findUnique({ where: { id } });
    if (!venue) return notFound("Venue not found");

    const settings = (venue.settings as Record<string, unknown>) || {};
    const currentConfig = (settings.bookingConfig as Partial<BookingConfig>) || {};

    // Strip pricing fields — they are now owned by pricing_groups rows.
    // Accept them in the body for backward-compat but discard silently.
    const { pricingRules: _pr, defaultPriceValue: _dpv, ...operationalBody } = body as BookingConfig & {
      pricingRules?: unknown;
      defaultPriceValue?: unknown;
    };

    const updatedConfig: BookingConfig = {
      ...DEFAULT_BOOKING_CONFIG,
      ...currentConfig,
      ...operationalBody,
      // Preserve any legacy pricing keys that are already in the stored config
      // so the read-fallback path in resolveCourtPricingMatrix still works.
      pricingRules: (currentConfig.pricingRules as BookingConfig["pricingRules"]) ?? DEFAULT_BOOKING_CONFIG.pricingRules,
      defaultPriceValue: (currentConfig.defaultPriceValue as number) ?? DEFAULT_BOOKING_CONFIG.defaultPriceValue,
    };

    if (updatedConfig.bookingStartHour >= updatedConfig.bookingEndHour) {
      return error("Start hour must be before end hour", 400);
    }

    if (
      updatedConfig.maxDurationMinutes != null &&
      (updatedConfig.maxDurationMinutes < 30 || updatedConfig.maxDurationMinutes % 30 !== 0)
    ) {
      return error("maxDurationMinutes must be a multiple of 30 and at least 30", 400);
    }

    if (
      updatedConfig.defaultDurationMinutes != null &&
      updatedConfig.defaultDurationMinutes % 30 !== 0
    ) {
      return error("defaultDurationMinutes must be a multiple of 30", 400);
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
