import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireManagerOrSuperAdmin, requireSuperAdmin } from "@/lib/auth";
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
        organization: { select: { id: true, name: true, country: true, currency: true } },
        _count: { select: { staffAssignments: true } },
      },
    });

    return json(
      venues.map((v) => ({
        ...v,
        sportType: v.sportType,
        organization: v.organization ?? null,
        _count: { staff: v._count.staffAssignments },
      }))
    );
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireSuperAdmin(request.headers);
    const body = await parseBody<{
      name: string;
      location?: string;
      sportType?: string;
      orgName?: string;
      orgCountry?: string;
      orgCurrency?: string;
    }>(request);

    let organizationId: string | null = null;
    if (body.orgName) {
      const orgCountry = body.orgCountry ?? "";
      const slug = body.orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const existingOrg = await prisma.organization.findFirst({
        where: { name: body.orgName, country: orgCountry },
        select: { id: true },
      });
      if (existingOrg) {
        organizationId = existingOrg.id;
      } else {
        const newOrg = await prisma.organization.create({
          data: {
            name: body.orgName,
            slug,
            country: orgCountry,
            currency: body.orgCurrency ?? "VND",
          },
        });
        organizationId = newOrg.id;
      }
    }

    const venue = await prisma.venue.create({
      data: {
        name: body.name,
        location: body.location || null,
        sportType: body.sportType ?? "pickleball",
        organizationId,
        ownerId: null,
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
      include: {
        organization: { select: { id: true, name: true, country: true, currency: true } },
      },
    });

    return json(venue, 201);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
