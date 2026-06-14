import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody, notFound } from "@/lib/api-helpers";
import { requireManagerOrSuperAdmin } from "@/lib/auth";
import { assertVenueAccess } from "@/lib/venue-scope";

export const dynamic = "force-dynamic";

export interface CancellationPolicy {
  freeCancelHours: number;
  partialCancelHours: number;
  noCancelHours: number;
}

export const DEFAULT_CANCELLATION_POLICY: CancellationPolicy = {
  freeCancelHours: 24,
  partialCancelHours: 12,
  noCancelHours: 4,
};

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireManagerOrSuperAdmin(request.headers);
    const { id } = await params;
    await assertVenueAccess(auth, id);
    const body = await parseBody<Partial<CancellationPolicy>>(request);

    const venue = await prisma.venue.findUnique({ where: { id } });
    if (!venue) return notFound("Venue not found");

    const settings = (venue.settings as Record<string, unknown>) || {};
    const current = (settings.cancellationPolicy as Partial<CancellationPolicy>) || {};

    const updated: CancellationPolicy = {
      ...DEFAULT_CANCELLATION_POLICY,
      ...current,
      ...body,
    };

    if (updated.noCancelHours >= updated.partialCancelHours) {
      return error("noCancelHours must be less than partialCancelHours", 400);
    }
    if (updated.partialCancelHours >= updated.freeCancelHours) {
      return error("partialCancelHours must be less than freeCancelHours", 400);
    }

    const updatedSettings = { ...settings, cancellationPolicy: updated };

    await prisma.venue.update({
      where: { id },
      data: { settings: updatedSettings as never },
    });

    return json({ cancellationPolicy: updated, venueId: id });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireManagerOrSuperAdmin(request.headers);
    const { id } = await params;
    await assertVenueAccess(auth, id);

    const venue = await prisma.venue.findUnique({ where: { id }, select: { settings: true } });
    if (!venue) return notFound("Venue not found");

    const settings = (venue.settings as Record<string, unknown>) || {};
    const policy = (settings.cancellationPolicy as Partial<CancellationPolicy>) || {};

    return json({
      cancellationPolicy: { ...DEFAULT_CANCELLATION_POLICY, ...policy },
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
