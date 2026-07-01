import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireManagerOrSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    requireManagerOrSuperAdmin(request.headers);
    const { id } = await params;

    const body = await parseBody<{
      name?: string;
      description?: string | null;
      lessonType?: "private" | "group";
      durationMin?: number;
      priceValue?: number;
      sessionsIncluded?: number;
      active?: boolean;
      sortOrder?: number;
      minPlayers?: number | null;
      maxPlayers?: number | null;
      pricePerAdditionalPlayer?: number | null;
    }>(request);

    const existing = await prisma.coachPackage.findUnique({ where: { id } });
    if (!existing) return error("Package not found", 404);

    const effectiveLessonType = body.lessonType ?? existing.lessonType;

    // Validate group pricing fields when provided
    if (effectiveLessonType === "group" && body.minPlayers != null) {
      if (body.minPlayers < 2) return error("minPlayers must be at least 2", 400);
      const maxP = body.maxPlayers ?? existing.maxPlayers ?? 8;
      if (maxP < body.minPlayers) return error("maxPlayers must be >= minPlayers", 400);
      if ((body.pricePerAdditionalPlayer ?? 0) < 0) return error("pricePerAdditionalPlayer must be >= 0", 400);
    }

    // When switching to private, clear group-pricing fields
    const clearGroupPricing = effectiveLessonType === "private";

    const pkg = await prisma.coachPackage.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.lessonType !== undefined && { lessonType: body.lessonType }),
        ...(body.durationMin !== undefined && { durationMin: body.durationMin }),
        ...(body.priceValue !== undefined && { priceValue: body.priceValue }),
        ...(body.sessionsIncluded !== undefined && { sessionsIncluded: body.sessionsIncluded }),
        ...(body.active !== undefined && { active: body.active }),
        ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
        ...(clearGroupPricing
          ? { minPlayers: null, maxPlayers: null, pricePerAdditionalPlayer: null }
          : {
              ...(body.minPlayers !== undefined && { minPlayers: body.minPlayers }),
              ...(body.maxPlayers !== undefined && { maxPlayers: body.maxPlayers }),
              ...(body.pricePerAdditionalPlayer !== undefined && {
                pricePerAdditionalPlayer: body.pricePerAdditionalPlayer,
              }),
            }),
      },
      include: {
        coach: { select: { id: true, name: true } },
      },
    });

    return json(pkg);
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

    const existing = await prisma.coachPackage.findUnique({ where: { id } });
    if (!existing) return error("Package not found", 404);

    await prisma.coachPackage.update({
      where: { id },
      data: { active: false },
    });

    return json({ success: true });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
