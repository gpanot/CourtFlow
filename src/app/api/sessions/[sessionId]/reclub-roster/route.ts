import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody, notFound } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
interface RosterEntry {
  referenceCode: string;
  eventName: string;
  players: unknown;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    requireStaff(request.headers);
    const { sessionId } = await params;

    const body = await parseBody<{
      referenceCode?: string;
      eventName?: string;
      roster?: unknown;
      rosters?: RosterEntry[];
    }>(request);

    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) return notFound("Session not found");

    let storedRosters: RosterEntry[];

    if (body.rosters && Array.isArray(body.rosters) && body.rosters.length > 0) {
      storedRosters = body.rosters;
    } else if (body.referenceCode) {
      storedRosters = [{
        referenceCode: body.referenceCode,
        eventName: body.eventName || "",
        players: body.roster ?? [],
      }];
    } else {
      return error("rosters array or referenceCode is required");
    }

    const first = storedRosters[0];

    const updated = await prisma.session.update({
      where: { id: sessionId },
      data: {
        reclubReferenceCode: first.referenceCode,
        reclubEventName: first.eventName || null,
        reclubRoster: storedRosters as unknown as Prisma.InputJsonValue,
      },
    });

    return json({
      id: updated.id,
      reclubReferenceCode: updated.reclubReferenceCode,
      reclubEventName: updated.reclubEventName,
      reclubRoster: updated.reclubRoster,
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
