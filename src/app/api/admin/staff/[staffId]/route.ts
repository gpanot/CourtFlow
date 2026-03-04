import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireSuperAdmin, hashPassword } from "@/lib/auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ staffId: string }> }
) {
  try {
    requireSuperAdmin(request.headers);
    const { staffId } = await params;
    const body = await parseBody<{
      name?: string;
      role?: "staff" | "superadmin";
      venueIds?: string[];
    }>(request);

    const existing = await prisma.staffMember.findUnique({ where: { id: staffId } });
    if (!existing) return error("Staff member not found", 404);

    const staff = await prisma.staffMember.update({
      where: { id: staffId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.role !== undefined && { role: body.role }),
        ...(body.venueIds !== undefined && {
          venues: { set: body.venueIds.map((id) => ({ id })) },
        }),
      },
      include: { venues: { select: { id: true, name: true } } },
    });

    return json({
      id: staff.id,
      name: staff.name,
      phone: staff.phone,
      role: staff.role,
      venues: staff.venues,
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ staffId: string }> }
) {
  try {
    requireSuperAdmin(request.headers);
    const { staffId } = await params;

    const existing = await prisma.staffMember.findUnique({ where: { id: staffId } });
    if (!existing) return error("Staff member not found", 404);

    await prisma.staffMember.delete({ where: { id: staffId } });

    return json({ success: true });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
