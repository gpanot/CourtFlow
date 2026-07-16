import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody, notFound } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    requireSuperAdmin(request.headers);
    const { id } = await params;
    const body = await parseBody<{
      name?: string;
      price?: number;
      sessionsIncluded?: number;
      passMode?: string;
      isOneTime?: boolean;
      description?: string | null;
      level?: string | null;
      skillTags?: string[];
      prerequisites?: string | null;
      ageRange?: string | null;
      coachIds?: string[];
    }>(request);

    const existing = await prisma.programPassType.findUnique({ where: { id } });
    if (!existing) return notFound("Pass type not found");

    const validModes = ["monthly", "days_30", "days_45", "days_60", "days_90"];
    if (body.passMode !== undefined && !validModes.includes(body.passMode)) {
      return error(`passMode must be one of: ${validModes.join(", ")}`);
    }

    await prisma.programPassType.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name.trim() }),
        ...(body.price !== undefined && { price: body.price }),
        ...(body.sessionsIncluded !== undefined && { sessionsIncluded: body.sessionsIncluded }),
        ...(body.passMode !== undefined && { passMode: body.passMode }),
        ...(body.isOneTime !== undefined && { isOneTime: body.isOneTime }),
        ...("description" in body && { description: body.description ?? null }),
        ...("level" in body && { level: body.level ?? null }),
        ...("skillTags" in body && { skillTags: body.skillTags ?? [] }),
        ...("prerequisites" in body && { prerequisites: body.prerequisites ?? null }),
        ...("ageRange" in body && { ageRange: body.ageRange ?? null }),
      },
    });

    if (body.coachIds !== undefined) {
      await prisma.programPassTypeCoach.deleteMany({ where: { passTypeId: id } });
      if (body.coachIds.length > 0) {
        await prisma.programPassTypeCoach.createMany({
          data: body.coachIds.map((coachId) => ({ passTypeId: id, coachId })),
          skipDuplicates: true,
        });
      }
    }

    const result = await prisma.programPassType.findUnique({
      where: { id },
      include: {
        coaches: {
          include: { coach: { select: { id: true, name: true } } },
        },
        _count: { select: { programPasses: { where: { status: "active" } } } },
      },
    });

    return json(result);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    requireSuperAdmin(request.headers);
    const { id } = await params;

    const existing = await prisma.programPassType.findUnique({ where: { id } });
    if (!existing) return notFound("Pass type not found");

    const activePasses = await prisma.programPass.count({
      where: { passTypeId: id, status: "active" },
    });
    if (activePasses > 0) {
      return error(
        `Cannot deactivate pass type with ${activePasses} active pass(es). Cancel or expire them first.`,
        400
      );
    }

    const result = await prisma.programPassType.update({
      where: { id },
      data: { isActive: false },
    });

    return json(result);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
