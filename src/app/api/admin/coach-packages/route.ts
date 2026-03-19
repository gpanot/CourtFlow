import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    requireSuperAdmin(request.headers);

    const coachId = request.nextUrl.searchParams.get("coachId");
    const venueId = request.nextUrl.searchParams.get("venueId");

    const packages = await prisma.coachPackage.findMany({
      where: {
        ...(coachId ? { coachId } : {}),
        ...(venueId ? { venueId } : {}),
      },
      include: {
        coach: { select: { id: true, name: true } },
        _count: { select: { lessons: true } },
      },
      orderBy: [{ coachId: "asc" }, { sortOrder: "asc" }],
    });

    return json(packages);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    requireSuperAdmin(request.headers);

    const body = await parseBody<{
      coachId: string;
      venueId: string;
      name: string;
      description?: string;
      lessonType: "private" | "group";
      durationMin: number;
      priceInCents: number;
      sessionsIncluded?: number;
    }>(request);

    if (!body.coachId || !body.venueId || !body.name || !body.lessonType || !body.durationMin || body.priceInCents == null) {
      return error("coachId, venueId, name, lessonType, durationMin, and priceInCents are required", 400);
    }

    const coach = await prisma.staffMember.findUnique({
      where: { id: body.coachId, isCoach: true },
    });
    if (!coach) return error("Coach not found", 404);

    const pkg = await prisma.coachPackage.create({
      data: {
        coachId: body.coachId,
        venueId: body.venueId,
        name: body.name,
        description: body.description || null,
        lessonType: body.lessonType,
        durationMin: body.durationMin,
        priceInCents: body.priceInCents,
        sessionsIncluded: body.sessionsIncluded ?? 1,
      },
      include: {
        coach: { select: { id: true, name: true } },
      },
    });

    return json(pkg, 201);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
