import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireManagerOrSuperAdmin } from "@/lib/auth";
import { normalizeAppAccess, staffAssignmentsToVenues } from "@/lib/staff-app-access";
import { getAuthorizedVenueIds } from "@/lib/venue-scope";

export const dynamic = "force-dynamic";
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ staffId: string }> }
) {
  try {
    const auth = requireManagerOrSuperAdmin(request.headers);
    const { staffId } = await params;
    const body = await parseBody<{
      name?: string;
      role?: "staff" | "manager" | "superadmin";
      venueIds?: string[];
      venueAssignments?: { venueId: string; appAccess: string[] }[];
      isCoach?: boolean;
      coachBio?: string | null;
      coachPhoto?: string | null;
    }>(request);

    const existing = await prisma.staffMember.findUnique({
      where: { id: staffId },
      include: { venueAssignments: { select: { venueId: true } } },
    });
    if (!existing) return error("Staff member not found", 404);

    // Managers cannot edit superadmin accounts
    if (auth.role === "manager" && existing.role === "superadmin") {
      return error("Cannot modify superadmin accounts", 403);
    }
    // Managers cannot promote to superadmin
    if (auth.role === "manager" && body.role === "superadmin") {
      return error("Managers cannot set superadmin role", 403);
    }
    // Managers can only edit staff in their own venues
    if (auth.role === "manager") {
      const ownedVenueIds = await getAuthorizedVenueIds(auth);
      const targetVenueIds = existing.venueAssignments.map((a) => a.venueId);
      const hasOverlap = targetVenueIds.some((vid) => ownedVenueIds.includes(vid));
      if (!hasOverlap && staffId !== auth.id) {
        return error("Cannot modify staff outside your venues", 403);
      }
    }

    const promotedToAdmin =
      body.role !== undefined &&
      (body.role === "manager" || body.role === "superadmin") &&
      existing.role !== body.role;

    await prisma.staffMember.update({
      where: { id: staffId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.role !== undefined && { role: body.role }),
        ...(body.isCoach !== undefined && { isCoach: body.isCoach }),
        ...(body.coachBio !== undefined && { coachBio: body.coachBio }),
        ...(body.coachPhoto !== undefined && { coachPhoto: body.coachPhoto }),
        // Auto-complete onboarding when promoting to manager/superadmin so they
        // land on /admin directly instead of being sent to the onboarding flow.
        ...(promotedToAdmin && { onboardingCompleted: true }),
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
            data: { staffId, venueId, appAccess: ["courtpay"] },
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
    const auth = requireManagerOrSuperAdmin(request.headers);
    const { staffId } = await params;

    const existing = await prisma.staffMember.findUnique({
      where: { id: staffId },
      include: { venueAssignments: { select: { venueId: true } } },
    });
    if (!existing) return error("Staff member not found", 404);

    if (auth.role === "manager") {
      if (existing.role === "superadmin") {
        return error("Cannot delete superadmin accounts", 403);
      }
      const ownedVenueIds = await getAuthorizedVenueIds(auth);
      const targetVenueIds = existing.venueAssignments.map((a) => a.venueId);
      const hasOverlap = targetVenueIds.some((vid) => ownedVenueIds.includes(vid));
      if (!hasOverlap) {
        return error("Cannot delete staff outside your venues", 403);
      }
    }

    await prisma.staffMember.delete({ where: { id: staffId } });

    return json({ success: true });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
