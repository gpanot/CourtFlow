import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireManagerOrSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    requireManagerOrSuperAdmin(request.headers);
    const { id } = await params;

    const body = await parseBody<{ venueId: string }>(request);
    if (!body.venueId?.trim()) return error("venueId is required", 400);

    const venue = await prisma.venue.update({
      where: { id: body.venueId.trim() },
      data: { organizationId: id },
      select: { id: true, name: true, sportType: true, location: true },
    });

    return json(venue);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    requireManagerOrSuperAdmin(request.headers);
    await params; // id not needed for unlink, venueId is the target

    const body = await parseBody<{ venueId: string }>(request);
    if (!body.venueId?.trim()) return error("venueId is required", 400);

    const venue = await prisma.venue.update({
      where: { id: body.venueId.trim() },
      data: { organizationId: null },
      select: { id: true, name: true },
    });

    return json(venue);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
