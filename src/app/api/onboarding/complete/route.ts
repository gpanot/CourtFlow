import { NextRequest } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";

export async function POST(request: NextRequest) {
  try {
    const auth = requireSuperAdmin(request.headers);

    const body = await parseBody<{
      venueName: string;
      location?: string;
      courtCount: number;
      courtLabels?: string[];
      expectedMaxPlayers?: number;
      playFrequency?: string;
      playTypes?: string[];
      painPoints?: string[];
    }>(request);

    if (!body.venueName) return error("Venue name is required");
    if (!body.courtCount || body.courtCount < 1) return error("At least one court is required");

    const venue = await prisma.venue.create({
      data: {
        name: body.venueName,
        location: body.location || null,
        expectedMaxPlayers: body.expectedMaxPlayers || null,
        playFrequency: body.playFrequency || null,
        playTypes: body.playTypes || [],
        painPoints: body.painPoints || [],
        staff: { connect: { id: auth.id } },
      },
    });

    const labels = body.courtLabels?.length
      ? body.courtLabels.slice(0, body.courtCount)
      : Array.from({ length: body.courtCount }, (_, i) => `Court ${i + 1}`);

    const courts = await Promise.all(
      labels.map((label) =>
        prisma.court.create({
          data: { venueId: venue.id, label },
        })
      )
    );

    await prisma.staffMember.update({
      where: { id: auth.id },
      data: { onboardingCompleted: true },
    });

    return json({
      venue: { id: venue.id, name: venue.name },
      courts: courts.map((c) => ({ id: c.id, label: c.label })),
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
