import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { emitToVenue } from "@/lib/socket-server";
import type { Prisma } from "@prisma/client";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const auth = requireStaff(request.headers);
    const { sessionId } = await params;

    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) return error("Session not found", 404);
    if (session.status === "closed") return error("Session already closed", 400);

    const now = new Date();

    // Build Reclub snapshot if roster data exists
    let reclubSnapshot: Prisma.InputJsonValue | undefined;
    console.log("[session/close] Checking Reclub data:", { hasRoster: !!session.reclubRoster, hasRefCode: !!session.reclubReferenceCode, sessionId });
    if (session.reclubRoster && session.reclubReferenceCode) {
      try {
        // reclubRoster is stored as a plain array of player objects
        const rosterPlayers = session.reclubRoster as Array<{
          reclubUserId: number;
          name: string;
          avatarUrl: string;
          isDefaultAvatar: boolean;
        }>;
        const roster = {
          eventName: session.reclubEventName ?? "",
          referenceCode: session.reclubReferenceCode,
          players: rosterPlayers,
        };

        const confirmedPayments = await prisma.pendingPayment.findMany({
          where: { sessionId, status: "confirmed" },
          select: {
            id: true,
            amount: true,
            createdAt: true,
            checkInPlayer: { select: { id: true, name: true, phone: true } },
            player: { select: { id: true, name: true, phone: true, reclubUserId: true, facePhotoPath: true, avatarPhotoPath: true } },
          },
        });

        // Resolve reclubUserId for payments that only have checkInPlayer
        const checkInPhones = confirmedPayments
          .filter((p) => p.checkInPlayer?.phone && !p.player)
          .map((p) => p.checkInPlayer!.phone);
        const linkedPlayers = checkInPhones.length > 0
          ? await prisma.player.findMany({
              where: { phone: { in: [...new Set(checkInPhones)] } },
              select: { id: true, name: true, phone: true, reclubUserId: true, facePhotoPath: true, avatarPhotoPath: true },
            })
          : [];
        const playerByPhone = new Map(linkedPlayers.map((p) => [p.phone, p]));

        // Build a map of reclubUserId → payment info
        const reclubToPayment = new Map<number, { playerId: string; playerName: string; amount: number; checkinTime: string; facePhotoUrl: string | null }>();
        for (const p of confirmedPayments) {
          let reclubUserId: number | null = null;
          let playerId: string | null = null;
          let playerName: string | null = null;
          let facePhotoUrl: string | null = null;

          if (p.player?.reclubUserId) {
            reclubUserId = p.player.reclubUserId;
            playerId = p.player.id;
            playerName = p.player.name;
            facePhotoUrl = p.player.avatarPhotoPath ?? p.player.facePhotoPath ?? null;
          } else if (p.checkInPlayer?.phone) {
            const linked = playerByPhone.get(p.checkInPlayer.phone);
            if (linked?.reclubUserId) {
              reclubUserId = linked.reclubUserId;
              playerId = linked.id;
              playerName = linked.name;
              facePhotoUrl = linked.avatarPhotoPath ?? linked.facePhotoPath ?? null;
            }
          }

          if (reclubUserId && playerId) {
            reclubToPayment.set(reclubUserId, {
              playerId,
              playerName: playerName ?? "Unknown",
              amount: p.amount,
              checkinTime: p.createdAt.toISOString(),
              facePhotoUrl,
            });
          }
        }

        // Build roster player entries
        const rosterIds = new Set(roster.players.map((p) => p.reclubUserId));
        const snapshotPlayers = roster.players.map((rp) => {
          const payment = reclubToPayment.get(rp.reclubUserId);
          return {
            reclubUserId: rp.reclubUserId,
            reclubName: rp.name,
            avatarUrl: rp.avatarUrl,
            courtpayPlayerId: payment?.playerId ?? null,
            courtpayName: payment?.playerName ?? null,
            paid: !!payment,
            amount: payment?.amount ?? null,
            checkinTime: payment?.checkinTime ?? null,
            facePhotoUrl: payment?.facePhotoUrl ?? null,
          };
        });

        // Walk-ins: paid but not on roster
        const walkIns: typeof snapshotPlayers = [];
        for (const p of confirmedPayments) {
          let reclubUserId: number | null = null;
          let playerId: string | null = null;
          let playerName: string | null = null;
          let facePhotoUrl: string | null = null;

          if (p.player?.reclubUserId) {
            reclubUserId = p.player.reclubUserId;
            playerId = p.player.id;
            playerName = p.player.name;
            facePhotoUrl = p.player.avatarPhotoPath ?? p.player.facePhotoPath ?? null;
          } else if (p.checkInPlayer?.phone) {
            const linked = playerByPhone.get(p.checkInPlayer.phone);
            if (linked?.reclubUserId) {
              reclubUserId = linked.reclubUserId;
              playerId = linked.id;
              playerName = linked.name;
              facePhotoUrl = linked.avatarPhotoPath ?? linked.facePhotoPath ?? null;
            } else {
              playerId = p.checkInPlayer.id;
              playerName = p.checkInPlayer.name;
              facePhotoUrl = linked?.avatarPhotoPath ?? linked?.facePhotoPath ?? null;
            }
          } else if (p.player) {
            playerId = p.player.id;
            playerName = p.player.name;
            facePhotoUrl = p.player.avatarPhotoPath ?? p.player.facePhotoPath ?? null;
          }

          if (!reclubUserId || !rosterIds.has(reclubUserId)) {
            walkIns.push({
              reclubUserId: reclubUserId ?? 0,
              reclubName: "",
              avatarUrl: "",
              courtpayPlayerId: playerId,
              courtpayName: playerName,
              paid: true,
              amount: p.amount,
              checkinTime: p.createdAt.toISOString(),
              facePhotoUrl,
            });
          }
        }

        const totalMatched = snapshotPlayers.filter((p) => p.paid).length;

        reclubSnapshot = {
          eventName: roster.eventName,
          referenceCode: roster.referenceCode,
          fetchedAt: session.date.toISOString(),
          closedAt: now.toISOString(),
          totalExpected: roster.players.length,
          totalMatched,
          totalUnmatched: roster.players.length - totalMatched,
          totalWalkIns: walkIns.length,
          players: [...snapshotPlayers, ...walkIns],
        } as unknown as Prisma.InputJsonValue;
      } catch (snapshotErr) {
        console.error("[session/close] Failed to build Reclub snapshot:", snapshotErr);
      }
    }
    console.log("[session/close] Snapshot built:", { hasSnapshot: !!reclubSnapshot, sessionId });

    const updated = await prisma.session.update({
      where: { id: sessionId },
      data: {
        status: "closed",
        closedAt: now,
        ...(reclubSnapshot ? { reclubSnapshot } : {}),
      },
    });

    await prisma.queueEntry.updateMany({
      where: { sessionId, status: { in: ["waiting", "assigned", "playing", "on_break"] } },
      data: { status: "left" },
    });

    await prisma.courtAssignment.updateMany({
      where: { sessionId, endedAt: null },
      data: { endedAt: now },
    });

    await prisma.court.updateMany({
      where: { venueId: session.venueId },
      data: { activeInSession: false, status: "idle", skipWarmupAfterMaintenance: false },
    });

    await prisma.auditLog.create({
      data: {
        venueId: session.venueId,
        staffId: auth.id,
        action: "session_closed",
        targetId: sessionId,
      },
    });

    emitToVenue(session.venueId, "session:updated", { session: updated, courts: [] });
    emitToVenue(session.venueId, "player:notification", {
      type: "session_closing",
      sessionId,
      message: "Today's session is ending — thanks for playing!",
    });

    return json(updated);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
