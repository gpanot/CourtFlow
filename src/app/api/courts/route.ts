import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  const venueId = request.nextUrl.searchParams.get("venueId");
  if (!venueId) return error("venueId is required");

  try {
    const courts = await prisma.court.findMany({
      where: { venueId },
      include: {
        courtAssignments: {
          where: { endedAt: null },
          take: 1,
          orderBy: { startedAt: "desc" },
        },
      },
    });
    return json(courts);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
