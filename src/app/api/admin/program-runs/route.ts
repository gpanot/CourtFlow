import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireAdminAccess } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireAdminAccess(request.headers);
    const sp = request.nextUrl.searchParams;
    const venueId = sp.get("venueId");
    const passTypeId = sp.get("passTypeId");
    const status = sp.get("status");
    const slim = sp.get("slim") === "1";

    if (!venueId) return error("venueId is required", 400);

    const where = {
      venueId,
      ...(passTypeId ? { passTypeId } : {}),
      ...(status ? { status } : {}),
    };

    if (slim) {
      // Lightweight response for pickers/dropdowns
      const runs = await prisma.programRun.findMany({
        where,
        select: { id: true, name: true, passType: { select: { name: true } } },
        orderBy: { name: "asc" },
      });
      return json(runs);
    }

    const runs = await prisma.programRun.findMany({
      where,
      include: {
        passType: { select: { id: true, name: true } },
        court: { select: { id: true, label: true } },
        coaches: {
          include: { coach: { select: { id: true, name: true } } },
        },
        _count: {
          select: { programPasses: true, classInstances: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return json(runs);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminAccess(request.headers);
    const body = await parseBody<{
      venueId: string;
      passTypeId: string;
      name: string;
      startDate: string;          // "YYYY-MM-DD"
      recurrenceStartHour: number;
      recurrenceDurationMin: number;
      recurrenceCount?: number;
      recurrenceEndDate?: string; // "YYYY-MM-DD"
      maxCapacity: number;
      courtIds?: string[];
      note?: string;
      coachIds?: string[];
    }>(request);

    if (!body.venueId) return error("venueId is required", 400);
    if (!body.passTypeId) return error("passTypeId is required", 400);
    if (!body.name?.trim()) return error("name is required", 400);
    if (!body.startDate) return error("startDate is required", 400);
    if (typeof body.recurrenceStartHour !== "number") return error("recurrenceStartHour is required", 400);
    if (typeof body.recurrenceDurationMin !== "number" || body.recurrenceDurationMin <= 0) {
      return error("recurrenceDurationMin must be a positive number", 400);
    }
    if (!body.recurrenceCount && !body.recurrenceEndDate) {
      return error("Either recurrenceCount or recurrenceEndDate must be provided", 400);
    }
    if (typeof body.maxCapacity !== "number" || body.maxCapacity < 1) {
      return error("maxCapacity must be at least 1", 400);
    }

    // Validate pass type belongs to venue
    const passType = await prisma.programPassType.findFirst({
      where: { id: body.passTypeId, venueId: body.venueId },
      select: { id: true },
    });
    if (!passType) return error("Pass type not found", 404);

    // Store startDate at noon local time (Prisma DATE write safety)
    const startDate = new Date(`${body.startDate}T12:00:00+07:00`);
    const recurrenceEndDate = body.recurrenceEndDate
      ? new Date(`${body.recurrenceEndDate}T12:00:00+07:00`)
      : null;

    const run = await prisma.programRun.create({
      data: {
        venueId: body.venueId,
        passTypeId: body.passTypeId,
        name: body.name.trim(),
        startDate,
        recurrenceStartHour: body.recurrenceStartHour,
        recurrenceDurationMin: body.recurrenceDurationMin,
        recurrenceCount: body.recurrenceCount ?? null,
        recurrenceEndDate,
        maxCapacity: body.maxCapacity,
        courtIds: body.courtIds ?? [],
        note: body.note ?? null,
        createdBy: auth.id,
      },
    });

    // Assign run-level coaches
    if (body.coachIds && body.coachIds.length > 0) {
      await prisma.programRunCoach.createMany({
        data: body.coachIds.map((coachId) => ({ runId: run.id, coachId })),
        skipDuplicates: true,
      });
    }

    const result = await prisma.programRun.findUnique({
      where: { id: run.id },
      include: {
        passType: { select: { id: true, name: true } },
        court: { select: { id: true, label: true } },
        coaches: { include: { coach: { select: { id: true, name: true } } } },
        _count: { select: { programPasses: true, classInstances: true } },
      },
    });

    return json(result, 201);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
