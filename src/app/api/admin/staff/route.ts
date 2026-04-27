import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireSuperAdmin, hashPassword } from "@/lib/auth";
import { normalizeAppAccess, staffAssignmentsToVenues } from "@/lib/staff-app-access";

export async function GET(request: NextRequest) {
  try {
    const auth = requireSuperAdmin(request.headers);

    const ownedVenueIds = (
      await prisma.venue.findMany({
        where: { staffAssignments: { some: { staffId: auth.id } } },
        select: { id: true },
      })
    ).map((v) => v.id);

    const staff = await prisma.staffMember.findMany({
      where: {
        OR: [
          { id: auth.id },
          { venueAssignments: { some: { venueId: { in: ownedVenueIds } } } },
          { venueAssignments: { none: {} } },
        ],
      },
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
    requireSuperAdmin(request.headers);
    const body = await parseBody<{
      name: string;
      phone: string;
      password: string;
      role: "staff" | "superadmin";
      venueIds?: string[];
      venueAssignments?: { venueId: string; appAccess: string[] }[];
    }>(request);

    if (!body.name || !body.phone || !body.password) {
      return error("Name, phone, and password are required");
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

    const staff = await prisma.staffMember.create({
      data: {
        name: body.name,
        phone: body.phone,
        passwordHash: hashPassword(body.password),
        role: body.role || "staff",
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
