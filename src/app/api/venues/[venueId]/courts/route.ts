import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  try {
    requireStaff(request.headers);
    const { venueId } = await params;
    const { label } = await parseBody<{ label: string }>(request);

    if (!label?.trim()) return error("Court label is required");

    const venue = await prisma.venue.findUnique({ where: { id: venueId } });
    if (!venue) return error("Venue not found", 404);

    const existing = await prisma.court.findFirst({
      where: { venueId, label: label.trim() },
    });
    if (existing) return error("A court with this label already exists at this venue", 409);

    const court = await prisma.court.create({
      data: {
        venueId,
        label: label.trim(),
        status: "idle",
        activeInSession: false,
      },
    });

    return json(court, 201);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
