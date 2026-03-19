import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    requireSuperAdmin(request.headers);
    const url = request.nextUrl;
    const venueId = url.searchParams.get("venueId");
    const dateStr = url.searchParams.get("date");

    if (!venueId) return error("venueId is required", 400);

    const where: Record<string, unknown> = { venueId };
    if (dateStr) {
      const date = new Date(dateStr);
      date.setHours(0, 0, 0, 0);
      where.date = date;
    }

    const blocks = await prisma.courtBlock.findMany({
      where,
      orderBy: { startTime: "asc" },
    });

    return json(blocks);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = requireSuperAdmin(request.headers);
    const body = await parseBody<{
      venueId: string;
      type: "private_competition" | "private_event" | "maintenance";
      title?: string;
      note?: string;
      courtIds: string[];
      date: string;
      startTime: string;
      endTime: string;
    }>(request);

    if (!body.venueId || !body.type || !body.courtIds?.length || !body.date || !body.startTime || !body.endTime) {
      return error("venueId, type, courtIds, date, startTime, and endTime are required", 400);
    }

    const validTypes = ["private_competition", "private_event", "maintenance", "open_play", "competition"];
    if (!validTypes.includes(body.type)) {
      return error("Invalid block type", 400);
    }

    const date = new Date(body.date);
    date.setHours(0, 0, 0, 0);
    const startTime = new Date(body.startTime);
    const endTime = new Date(body.endTime);

    if (endTime <= startTime) {
      return error("endTime must be after startTime", 400);
    }

    const block = await prisma.courtBlock.create({
      data: {
        venueId: body.venueId,
        type: body.type,
        title: body.title || null,
        note: body.note || null,
        courtIds: body.courtIds,
        date,
        startTime,
        endTime,
        createdBy: admin.id,
      },
    });

    return json(block, 201);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
