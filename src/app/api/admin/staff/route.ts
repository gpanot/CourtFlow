import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireSuperAdmin, hashPassword } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = requireSuperAdmin(request.headers);

    const ownedVenueIds = (
      await prisma.venue.findMany({
        where: { staff: { some: { id: auth.id } } },
        select: { id: true },
      })
    ).map((v) => v.id);

    const staff = await prisma.staffMember.findMany({
      where: {
        OR: [
          { id: auth.id },
          { venues: { some: { id: { in: ownedVenueIds } } } },
          { venues: { none: {} } },
        ],
      },
      include: {
        venues: {
          select: { id: true, name: true },
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
        venues: s.venues,
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
    }>(request);

    if (!body.name || !body.phone || !body.password) {
      return error("Name, phone, and password are required");
    }

    const existing = await prisma.staffMember.findUnique({ where: { phone: body.phone } });
    if (existing) return error("Phone already in use", 409);

    const staff = await prisma.staffMember.create({
      data: {
        name: body.name,
        phone: body.phone,
        passwordHash: hashPassword(body.password),
        role: body.role || "staff",
        venues: body.venueIds?.length
          ? { connect: body.venueIds.map((id) => ({ id })) }
          : undefined,
      },
      include: { venues: { select: { id: true, name: true } } },
    });

    return json({
      id: staff.id,
      name: staff.name,
      phone: staff.phone,
      role: staff.role,
      venues: staff.venues,
    }, 201);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
