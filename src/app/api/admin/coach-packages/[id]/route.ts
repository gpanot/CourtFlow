import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    requireSuperAdmin(request.headers);
    const { id } = await params;

    const body = await parseBody<{
      name?: string;
      description?: string | null;
      lessonType?: "private" | "group";
      durationMin?: number;
      priceInCents?: number;
      sessionsIncluded?: number;
      active?: boolean;
      sortOrder?: number;
    }>(request);

    const existing = await prisma.coachPackage.findUnique({ where: { id } });
    if (!existing) return error("Package not found", 404);

    const pkg = await prisma.coachPackage.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.lessonType !== undefined && { lessonType: body.lessonType }),
        ...(body.durationMin !== undefined && { durationMin: body.durationMin }),
        ...(body.priceInCents !== undefined && { priceInCents: body.priceInCents }),
        ...(body.sessionsIncluded !== undefined && { sessionsIncluded: body.sessionsIncluded }),
        ...(body.active !== undefined && { active: body.active }),
        ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
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
    requireSuperAdmin(request.headers);
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
