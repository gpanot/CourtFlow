import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    requireSuperAdmin(request.headers);
    const venueId = request.nextUrl.searchParams.get("venueId");
    const includeUnpublished = request.nextUrl.searchParams.get("includeUnpublished") === "1";
    if (!venueId) return error("venueId is required");

    const types = await prisma.programPassType.findMany({
      where: { venueId, ...(includeUnpublished ? {} : { isActive: true }) },
      include: {
        coaches: {
          include: { coach: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" },
        },
        _count: {
          select: { programPasses: { where: { status: "active" } } },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return json(types);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    requireSuperAdmin(request.headers);
    const body = await parseBody<{
      venueId: string;
      name: string;
      price: number;
      sessionsIncluded?: number;
      isActive?: boolean;
      description?: string | null;
      level?: string | null;
      skillTags?: string[];
      prerequisites?: string | null;
      ageRange?: string | null;
      coachIds?: string[];
    }>(request);

    if (!body.venueId) return error("venueId is required");
    if (!body.name?.trim()) return error("name is required");
    if (typeof body.price !== "number" || body.price < 0) return error("price must be a non-negative number");

    const passType = await prisma.programPassType.create({
      data: {
        venueId: body.venueId,
        name: body.name.trim(),
        price: body.price,
        sessionsIncluded: body.sessionsIncluded ?? 12,
        isActive: body.isActive ?? true,
        description: body.description ?? null,
        level: body.level ?? null,
        skillTags: body.skillTags ?? [],
        prerequisites: body.prerequisites ?? null,
        ageRange: body.ageRange ?? null,
      },
    });

    if (body.coachIds && body.coachIds.length > 0) {
      await prisma.programPassTypeCoach.createMany({
        data: body.coachIds.map((coachId) => ({
          passTypeId: passType.id,
          coachId,
        })),
        skipDuplicates: true,
      });
    }

    const result = await prisma.programPassType.findUnique({
      where: { id: passType.id },
      include: {
        coaches: {
          include: { coach: { select: { id: true, name: true } } },
        },
        _count: { select: { programPasses: { where: { status: "active" } } } },
      },
    });

    return json(result, 201);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
