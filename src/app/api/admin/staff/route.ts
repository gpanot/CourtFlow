import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireManagerOrSuperAdmin, hashPassword } from "@/lib/auth";
import { normalizeAppAccess, staffAssignmentsToVenues } from "@/lib/staff-app-access";
import { getAuthorizedVenueIds } from "@/lib/venue-scope";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const auth = requireManagerOrSuperAdmin(request.headers);
    const ownedVenueIds = await getAuthorizedVenueIds(auth);

    const whereClause =
      auth.role === "superadmin"
        ? {
            OR: [
              { id: auth.id },
              { venueAssignments: { some: { venueId: { in: ownedVenueIds } } } },
              { venueAssignments: { none: {} } },
            ],
          }
        : {
            // Managers must never see superadmin accounts
            role: { not: "superadmin" as const },
            OR: [
              { id: auth.id },
              { venueAssignments: { some: { venueId: { in: ownedVenueIds } } } },
            ],
          };

    const staff = await prisma.staffMember.findMany({
      where: whereClause,
      include: {
        venueAssignments: {
          include: { venue: { select: { id: true, name: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return json(
      staff.map((s) => ({
        id: s.id,
        name: s.name,
        phone: s.phone,
        role: s.role,
        isCoach: s.isCoach,
        coachBio: s.coachBio,
        coachPhoto: s.coachPhoto,
        venues: staffAssignmentsToVenues(s.venueAssignments),
        createdAt: s.createdAt,
      }))
    );
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireManagerOrSuperAdmin(request.headers);
    const body = await parseBody<{
      name: string;
      phone: string;
      password: string;
      role: "staff" | "manager" | "superadmin";
      venueIds?: string[];
      venueAssignments?: { venueId: string; appAccess: string[] }[];
      isCoach?: boolean;
      coachBio?: string | null;
    }>(request);

    if (!body.name || !body.phone || !body.password) {
      return error("Name, phone, and password are required");
    }

    // Managers cannot create superadmin accounts
    if (auth.role === "manager" && body.role === "superadmin") {
      return error("Managers cannot create superadmin accounts", 403);
    }

    // Managers can only assign staff to their own venues
    if (auth.role === "manager") {
      const ownedVenueIds = await getAuthorizedVenueIds(auth);
      const requestedVenueIds =
        body.venueAssignments?.map((r) => r.venueId) ?? body.venueIds ?? [];
      const unauthorized = requestedVenueIds.filter((id) => !ownedVenueIds.includes(id));
      if (unauthorized.length > 0) {
        return error("Cannot assign staff to venues you do not own", 403);
      }
    }

    const existing = await prisma.staffMember.findUnique({ where: { phone: body.phone } });
    if (existing) return error("Phone already in use", 409);

    const assignmentCreates =
      body.venueAssignments?.map((row) => ({
        venueId: row.venueId,
        appAccess: normalizeAppAccess(row.appAccess),
      })) ??
      body.venueIds?.map((venueId) => ({
        venueId,
        appAccess: normalizeAppAccess(["courtflow"]),
      })) ??
      [];

    const createdRole = body.role || "staff";
    // Staff and managers are created by an admin — they don't go through onboarding
    // (only superadmins who self-sign-up need to create their first venue)
    const onboardingCompleted = createdRole !== "superadmin";

    const staff = await prisma.staffMember.create({
      data: {
        name: body.name,
        phone: body.phone,
        passwordHash: hashPassword(body.password),
        role: createdRole,
        onboardingCompleted,
        ...(body.isCoach !== undefined && { isCoach: body.isCoach }),
        ...(body.coachBio !== undefined && { coachBio: body.coachBio }),
        ...(assignmentCreates.length > 0
          ? {
              venueAssignments: {
                create: assignmentCreates,
              },
            }
          : {}),
      },
      include: {
        venueAssignments: {
          include: { venue: { select: { id: true, name: true } } },
        },
      },
    });

    return json(
      {
        id: staff.id,
        name: staff.name,
        phone: staff.phone,
        role: staff.role,
        venues: staffAssignmentsToVenues(staff.venueAssignments),
      },
      201
    );
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
