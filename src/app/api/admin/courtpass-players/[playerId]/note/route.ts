import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { getAuthorizedVenueIds } from "@/lib/venue-scope";

export const dynamic = "force-dynamic";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> }
) {
  try {
    const auth = requireStaff(request.headers);
    const { playerId } = await params;
    const body = await parseBody<{ venueId: string; content: string }>(request);

    if (!body.venueId) return error("venueId is required", 400);
    if (body.content === undefined) return error("content is required", 400);

    if (auth.role !== "superadmin") {
      const authorizedIds = await getAuthorizedVenueIds(auth);
      if (!authorizedIds.includes(body.venueId)) {
        return error("Forbidden", 403);
      }
    }

    // Verify player exists (either Player or CheckInPlayer)
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { id: true },
    });
    if (!player) return error("Player not found", 404);

    const staffName = auth.id ?? "Staff";

    const note = await prisma.playerNote.upsert({
      where: { playerId_venueId: { playerId, venueId: body.venueId } },
      create: {
        playerId,
        venueId: body.venueId,
        content: body.content,
        updatedBy: staffName,
      },
      update: {
        content: body.content,
        updatedBy: staffName,
      },
    });

    return json({ content: note.content, updatedAt: note.updatedAt.toISOString(), updatedBy: note.updatedBy });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
