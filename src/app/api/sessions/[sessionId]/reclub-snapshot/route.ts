import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import type { Prisma } from "@prisma/client";

interface SnapshotPlayer {
  reclubUserId: number;
  reclubName: string;
  avatarUrl: string;
  courtpayPlayerId: string | null;
  courtpayName: string | null;
  paid: boolean;
  amount: number | null;
  checkinTime: string | null;
  facePhotoUrl?: string | null;
}

interface ReclubSnapshot {
  eventName: string;
  referenceCode: string;
  fetchedAt: string;
  closedAt: string;
  totalExpected: number;
  totalMatched: number;
  totalUnmatched: number;
  totalWalkIns: number;
  players: SnapshotPlayer[];
}

/**
 * PATCH — Link a walk-in player to a Reclub roster member in the snapshot.
 * Only allowed on the latest closed session for the venue.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    requireStaff(request.headers);
    const { sessionId } = await params;

    const { walkInIndex, reclubUserId } = await parseBody<{
      walkInIndex: number;
      reclubUserId: number;
    }>(request);

    if (typeof walkInIndex !== "number" || typeof reclubUserId !== "number") {
      return error("walkInIndex and reclubUserId are required", 400);
    }

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true, venueId: true, status: true, closedAt: true, reclubSnapshot: true },
    });
    if (!session) return error("Session not found", 404);
    if (session.status !== "closed") return error("Session is not closed", 400);
    if (!session.reclubSnapshot) return error("No Reclub snapshot on this session", 400);

    const newerClosed = await prisma.session.findFirst({
      where: { venueId: session.venueId, status: "closed", closedAt: { gt: session.closedAt! } },
      select: { id: true },
    });
    if (newerClosed) return error("Only the latest closed session can be edited", 403);

    const snapshot = session.reclubSnapshot as unknown as ReclubSnapshot;
    const walkIns = snapshot.players.filter((p) => !p.reclubName);
    const rosterPlayers = snapshot.players.filter((p) => p.reclubName);

    if (walkInIndex < 0 || walkInIndex >= walkIns.length) {
      return error("Invalid walkInIndex", 400);
    }

    const targetRoster = rosterPlayers.find((p) => p.reclubUserId === reclubUserId);
    if (!targetRoster) return error("Reclub member not found in roster", 404);
    if (targetRoster.paid) return error("This Reclub member is already linked", 400);

    const walkIn = walkIns[walkInIndex];

    // Update the roster player with walk-in's payment data
    targetRoster.courtpayPlayerId = walkIn.courtpayPlayerId;
    targetRoster.courtpayName = walkIn.courtpayName;
    targetRoster.paid = true;
    targetRoster.amount = walkIn.amount;
    targetRoster.checkinTime = walkIn.checkinTime;
    targetRoster.facePhotoUrl = walkIn.facePhotoUrl;

    // Remove the walk-in from the list
    const walkInGlobalIdx = snapshot.players.indexOf(walkIn);
    snapshot.players.splice(walkInGlobalIdx, 1);

    // Recompute stats
    const updatedRoster = snapshot.players.filter((p) => p.reclubName);
    const updatedWalkIns = snapshot.players.filter((p) => !p.reclubName);
    snapshot.totalMatched = updatedRoster.filter((p) => p.paid).length;
    snapshot.totalUnmatched = updatedRoster.filter((p) => !p.paid).length;
    snapshot.totalWalkIns = updatedWalkIns.length;

    await prisma.session.update({
      where: { id: sessionId },
      data: { reclubSnapshot: snapshot as unknown as Prisma.InputJsonValue },
    });

    return json({ snapshot });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
