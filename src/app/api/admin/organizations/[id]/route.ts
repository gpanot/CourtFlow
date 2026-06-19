import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireManagerOrSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

const PAYMENT_REGION_MAP: Record<string, string> = {
  VN: "SEA", TH: "SEA", SG: "SEA", MY: "SEA", PH: "SEA",
  FR: "EU",  ES: "EU",  DE: "EU",
  AU: "ANZ", NZ: "ANZ",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    requireManagerOrSuperAdmin(request.headers);
    const { id } = await params;

    const org = await prisma.organization.findUnique({
      where: { id },
      include: {
        venues: {
          select: { id: true, name: true, sportType: true, location: true },
          orderBy: { name: "asc" },
        },
        _count: { select: { venues: true } },
      },
    });

    if (!org) return error("Organization not found", 404);

    // Find managers whose assigned venues overlap with this org's venues
    const orgVenueIds = org.venues.map((v) => v.id);
    const linkedManagers =
      orgVenueIds.length > 0
        ? await prisma.staffMember.findMany({
            where: {
              role: "manager",
              venueAssignments: { some: { venueId: { in: orgVenueIds } } },
            },
            select: { id: true, name: true, email: true },
            orderBy: { name: "asc" },
          })
        : [];

    return json({ ...org, managers: linkedManagers });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    requireManagerOrSuperAdmin(request.headers);
    const { id } = await params;

    const body = await parseBody<{
      name?: string;
      country?: string;
      currency?: string;
      venueId?: string;
    }>(request);

    const data: Record<string, unknown> = {};
    if (body.name?.trim()) data.name = body.name.trim();
    if (body.country?.trim()) {
      data.country = body.country.trim();
      data.paymentRegion = PAYMENT_REGION_MAP[body.country.trim()] ?? "OTHER";
    }
    if (body.currency?.trim()) data.currency = body.currency.trim();

    const org = await prisma.organization.update({
      where: { id },
      data,
    });

    if (body.venueId?.trim()) {
      await prisma.venue.update({
        where: { id: body.venueId.trim() },
        data: { organizationId: org.id },
      });
    }

    return json(org);
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
    const { id } = await params;

    const org = await prisma.organization.findUnique({
      where: { id },
      select: { _count: { select: { venues: true } } },
    });

    if (!org) return error("Organization not found", 404);
    if (org._count.venues > 0) {
      return error("Cannot delete an organization with linked venues", 400);
    }

    await prisma.organization.delete({ where: { id } });
    return json({ deleted: true });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
