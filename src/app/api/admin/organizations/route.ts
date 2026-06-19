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

export async function GET(request: NextRequest) {
  try {
    requireManagerOrSuperAdmin(request.headers);

    const orgs = await prisma.organization.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        country: true,
        currency: true,
        paymentRegion: true,
        createdAt: true,
        _count: { select: { venues: true } },
      },
      orderBy: { name: "asc" },
    });

    return json(orgs);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    requireManagerOrSuperAdmin(request.headers);

    const body = await parseBody<{
      name: string;
      country: string;
      currency?: string;
      venueId?: string;
    }>(request);

    if (!body.name?.trim()) return error("name is required", 400);
    if (!body.country?.trim()) return error("country is required", 400);

    const name = body.name.trim();
    const country = body.country.trim();
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const paymentRegion = PAYMENT_REGION_MAP[country] ?? "OTHER";

    const existing = await prisma.organization.findFirst({
      where: { name, country },
    });

    const org = existing ?? await prisma.organization.create({
      data: {
        name,
        slug,
        country,
        currency: body.currency?.trim() ?? "VND",
        paymentRegion,
      },
    });

    if (body.venueId?.trim()) {
      await prisma.venue.update({
        where: { id: body.venueId.trim() },
        data: { organizationId: org.id },
      });
    }

    return json(org, 201);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
