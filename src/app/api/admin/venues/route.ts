import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = requireSuperAdmin(request.headers);

    const venues = await prisma.venue.findMany({
      where: { staff: { some: { id: auth.id } } },
      include: {
        courts: true,
        sessions: {
          where: { status: "open" },
          take: 1,
          orderBy: { openedAt: "desc" },
        },
        _count: { select: { staff: true } },
      },
    });

    return json(venues);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireSuperAdmin(request.headers);
    const body = await parseBody<{ name: string; location?: string }>(request);

    const venue = await prisma.venue.create({
      data: {
        name: body.name,
        location: body.location || null,
        staff: { connect: { id: auth.id } },
        settings: {
          autoStartDelay: 180,
          postGameTimeout: 180,
          breakOptions: [5, 10, 15, 20, 30],
          gpsRadius: 200,
          maxGroupSize: 4,
          maxSkillGap: 1,
          defaultCourtType: "mixed",
        },
      },
    });

    return json(venue, 201);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
