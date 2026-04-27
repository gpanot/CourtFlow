import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";
import { normalizeAppAccess, staffAssignmentsToVenues } from "@/lib/staff-app-access";

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
      venueAssignments?: { venueId: string; appAccess: string[] }[];
      isCoach?: boolean;
      coachBio?: string | null;
      coachPhoto?: string | null;
    }>(request);

    const existing = await prisma.staffMember.findUnique({ where: { id: staffId } });
    if (!existing) return error("Staff member not found", 404);

    await prisma.staffMember.update({
      where: { id: staffId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.role !== undefined && { role: body.role }),
        ...(body.isCoach !== undefined && { isCoach: body.isCoach }),
        ...(body.coachBio !== undefined && { coachBio: body.coachBio }),
        ...(body.coachPhoto !== undefined && { coachPhoto: body.coachPhoto }),
      },
    });

    if (body.venueAssignments !== undefined) {
      await prisma.$transaction(async (tx) => {
        await tx.staffVenueAssignment.deleteMany({ where: { staffId } });
        for (const row of body.venueAssignments!) {
          const access = normalizeAppAccess(row.appAccess);
          await tx.staffVenueAssignment.create({
            data: { staffId, venueId: row.venueId, appAccess: access },
          });
        }
      });
    } else if (body.venueIds !== undefined) {
      const ids = body.venueIds;
      await prisma.$transaction(async (tx) => {
        await tx.staffVenueAssignment.deleteMany({ where: { staffId } });
        for (const venueId of ids) {
          await tx.staffVenueAssignment.create({
            data: { staffId, venueId, appAccess: ["courtflow"] },
          });
        }
      });
    }

    const staff = await prisma.staffMember.findUniqueOrThrow({
      where: { id: staffId },
      include: {
        venueAssignments: {
          include: { venue: { select: { id: true, name: true } } },
        },
      },
    });

    return json({
      id: staff.id,
      name: staff.name,
      phone: staff.phone,
      role: staff.role,
      isCoach: staff.isCoach,
      coachBio: staff.coachBio,
      coachPhoto: staff.coachPhoto,
      venues: staffAssignmentsToVenues(staff.venueAssignments),
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
