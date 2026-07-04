import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody, notFound } from "@/lib/api-helpers";
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
      price?: number;
      sessionsIncluded?: number;
      coachIds?: string[];
    }>(request);

    const existing = await prisma.programPassType.findUnique({ where: { id } });
    if (!existing) return notFound("Pass type not found");

    await prisma.programPassType.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name.trim() }),
        ...(body.price !== undefined && { price: body.price }),
        ...(body.sessionsIncluded !== undefined && { sessionsIncluded: body.sessionsIncluded }),
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
    requireManagerOrSuperAdmin(request.headers);
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
