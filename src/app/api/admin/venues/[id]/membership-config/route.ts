import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody, notFound } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";
import { DEFAULT_MEMBERSHIP_CONFIG, type MembershipConfig } from "@/lib/booking";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    requireSuperAdmin(request.headers);
    const { id } = await params;
    const body = await parseBody<Partial<MembershipConfig>>(request);

    const venue = await prisma.venue.findUnique({ where: { id } });
    if (!venue) return notFound("Venue not found");

    const settings = (venue.settings as Record<string, unknown>) || {};
    const currentConfig = (settings.membershipConfig as Partial<MembershipConfig>) || {};

    const updatedConfig: MembershipConfig = {
      ...DEFAULT_MEMBERSHIP_CONFIG,
      ...currentConfig,
      ...body,
    };

    const updatedSettings = { ...settings, membershipConfig: updatedConfig } as Record<string, unknown>;

    const updated = await prisma.venue.update({
      where: { id },
      data: { settings: updatedSettings as never },
    });

    return json({ membershipConfig: updatedConfig, venueId: updated.id });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
