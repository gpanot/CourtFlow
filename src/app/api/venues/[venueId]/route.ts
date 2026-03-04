import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, notFound, parseBody } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  try {
    const { venueId } = await params;
    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      include: { courts: true },
    });
    if (!venue) return notFound("Venue not found");
    return json(venue);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  try {
    requireSuperAdmin(request.headers);
    const { venueId } = await params;
    const body = await parseBody<Record<string, unknown>>(request);

    const venue = await prisma.venue.update({
      where: { id: venueId },
      data: body,
    });
    return json(venue);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
