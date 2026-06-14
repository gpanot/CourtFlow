import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireManagerOrSuperAdmin } from "@/lib/auth";
import { getAuthorizedVenueIds } from "@/lib/venue-scope";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const auth = requireManagerOrSuperAdmin(request.headers);
    const venueIds = await getAuthorizedVenueIds(auth);

    const venues = await prisma.venue.findMany({
      where: { id: { in: venueIds } },
      include: {
        courts: { orderBy: { label: "asc" } },
        sessions: {
          where: { status: "open" },
          take: 1,
          orderBy: { openedAt: "desc" },
        },
        owner: { select: { id: true, name: true } },
        _count: { select: { staffAssignments: true } },
      },
    });

    return json(
      venues.map((v) => ({
        ...v,
        _count: { staff: v._count.staffAssignments },
      }))
    );
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireManagerOrSuperAdmin(request.headers);
    const body = await parseBody<{ name: string; location?: string }>(request);

    const venue = await prisma.venue.create({
      data: {
        name: body.name,
        location: body.location || null,
        ownerId: auth.role === "manager" ? auth.id : null,
        staffAssignments: {
          create: [{ staffId: auth.id, appAccess: ["courtflow"] }],
        },
        settings: {
          autoStartDelay: 180,
          postGameTimeout: 180,
          breakOptions: [5, 10, 15, 20, 30],
          gpsRadius: 200,
          maxGroupSize: 4,
          maxSkillGap: 1,
          defaultCourtType: "mixed",
          bookingConfig: {
            slotDurationMinutes: 60,
            bookingStartHour: 8,
            bookingEndHour: 22,
            defaultPriceValue: 0,
            pricingRules: [],
            cancellationHours: 24,
          },
          membershipConfig: {
            contactWhatsApp: null,
            contactEmail: null,
          },
        },
      },
    });

    return json(venue, 201);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
