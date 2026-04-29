import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody, notFound } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { Prisma } from "@prisma/client";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    requireStaff(request.headers);
    const { sessionId } = await params;

    const { referenceCode, eventName, roster } = await parseBody<{
      referenceCode: string;
      eventName: string;
      roster: unknown;
    }>(request);

    if (!referenceCode) return error("referenceCode is required");

    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) return notFound("Session not found");

    const updated = await prisma.session.update({
      where: { id: sessionId },
      data: {
        reclubReferenceCode: referenceCode,
        reclubEventName: eventName || null,
        reclubRoster: (roster ?? Prisma.DbNull) as Prisma.InputJsonValue,
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
