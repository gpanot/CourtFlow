import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody, notFound } from "@/lib/api-helpers";
import { requireManagerOrSuperAdmin } from "@/lib/auth";
import { assertVenueAccess } from "@/lib/venue-scope";

export const dynamic = "force-dynamic";

// Common IANA timezones for the picker — extend as needed
export const SUPPORTED_TIMEZONES = [
  "Asia/Ho_Chi_Minh",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Kuala_Lumpur",
  "Asia/Jakarta",
  "Asia/Manila",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "America/Chicago",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC",
];

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireManagerOrSuperAdmin(request.headers);
    const { id } = await params;
    await assertVenueAccess(auth, id);

    const { timezone } = await parseBody<{ timezone: string }>(request);

    if (!timezone || !SUPPORTED_TIMEZONES.includes(timezone)) {
      return error("Invalid or unsupported timezone", 400);
    }

    const venue = await prisma.venue.findUnique({ where: { id } });
    if (!venue) return notFound("Venue not found");

    const updated = await prisma.venue.update({
      where: { id },
      data: { timezone },
      select: { id: true, timezone: true },
    });

    return json(updated);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
