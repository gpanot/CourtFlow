import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireManagerOrSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    requireManagerOrSuperAdmin(request.headers);

    const coachId = request.nextUrl.searchParams.get("coachId");
    const venueId = request.nextUrl.searchParams.get("venueId");

    const packages = await prisma.coachPackage.findMany({
      where: {
        ...(coachId ? { coachId } : {}),
        ...(venueId ? { venueId } : {}),
      },
      include: {
        coach: { select: { id: true, name: true } },
        _count: { select: { lessons: true } },
      },
      orderBy: [{ coachId: "asc" }, { sortOrder: "asc" }],
    });

    return json(packages);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    requireManagerOrSuperAdmin(request.headers);

    const body = await parseBody<{
      coachId: string;
      venueId: string;
      name: string;
      description?: string;
      lessonType: "private" | "group";
      durationMin: number;
      priceValue: number;
      sessionsIncluded?: number;
      minPlayers?: number;
      maxPlayers?: number;
      pricePerAdditionalPlayer?: number;
    }>(request);

    if (!body.coachId || !body.venueId || !body.name || !body.lessonType || !body.durationMin || body.priceValue == null) {
      return error("coachId, venueId, name, lessonType, durationMin, and priceValue are required", 400);
    }

    // Validate group pricing fields when provided
    if (body.lessonType === "group" && body.minPlayers != null) {
      if (body.minPlayers < 2) return error("minPlayers must be at least 2", 400);
      const maxP = body.maxPlayers ?? 8;
      if (maxP < body.minPlayers) return error("maxPlayers must be >= minPlayers", 400);
      if ((body.pricePerAdditionalPlayer ?? 0) < 0) return error("pricePerAdditionalPlayer must be >= 0", 400);
    }

    const coach = await prisma.staffMember.findUnique({
      where: { id: body.coachId, isCoach: true },
    });
    if (!coach) return error("Coach not found", 404);

    const isGroupPricing = body.lessonType === "group" && body.minPlayers != null;

    const pkg = await prisma.coachPackage.create({
      data: {
        coachId: body.coachId,
        venueId: body.venueId,
        name: body.name,
        description: body.description || null,
        lessonType: body.lessonType,
        durationMin: body.durationMin,
        priceValue: body.priceValue,
        sessionsIncluded: body.sessionsIncluded ?? 1,
        minPlayers: isGroupPricing ? (body.minPlayers ?? null) : null,
        maxPlayers: isGroupPricing ? (body.maxPlayers ?? 8) : null,
        pricePerAdditionalPlayer: isGroupPricing ? (body.pricePerAdditionalPlayer ?? 0) : null,
      },
      include: {
        coach: { select: { id: true, name: true } },
      },
    });

    return json(pkg, 201);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
