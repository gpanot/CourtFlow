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

    // Build Reclub snapshot — always capture walk-ins; also match against roster if one exists
    let reclubSnapshot: Prisma.InputJsonValue | undefined;
    {
      try {
        interface ReclubPlayerRaw {
          reclubUserId: number;
          name: string;
          avatarUrl: string;
          isDefaultAvatar: boolean;
        }
        interface RosterObj {
          referenceCode: string;
          eventName: string;
          players: ReclubPlayerRaw[];
        }

        // Detect format: new = array of roster objects, old = flat player array
        const rawRoster = session.reclubRoster as unknown;
        let rosters: RosterObj[];
        if (
          Array.isArray(rawRoster) &&
          rawRoster.length > 0 &&
          typeof rawRoster[0] === "object" &&
          rawRoster[0] !== null &&
          "referenceCode" in rawRoster[0]
        ) {
          rosters = rawRoster as RosterObj[];
        } else if (Array.isArray(rawRoster) && session.reclubReferenceCode) {
          rosters = [{
            referenceCode: session.reclubReferenceCode,
            eventName: session.reclubEventName ?? "",
            players: rawRoster as ReclubPlayerRaw[],
          }];
        } else {
          rosters = [];
        }

        // Always fetch confirmed payments to capture walk-ins even when no roster exists
        const confirmedPayments = await prisma.pendingPayment.findMany({
          where: { sessionId, status: "confirmed" },
          select: {
            id: true,
            amount: true,
            partyCount: true,
            createdAt: true,
            checkInPlayer: { select: { id: true, name: true, phone: true } },
            player: { select: { id: true, name: true, phone: true, reclubUserId: true, facePhotoPath: true, avatarPhotoPath: true } },
          },
        });

        // For CourtPay walk-ins with no linked player, resolve by phone
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

        // Map reclubUserId → payment info for roster matching
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

        // Union of all roster player IDs across all events
        const allRosterIds = new Set<number>();
        for (const r of rosters) {
          for (const p of r.players) allRosterIds.add(p.reclubUserId);
        }

        // Build per-event snapshot entries (only when roster exists)
        const eventSnapshots = rosters.map((roster) => {
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
          const matched = snapshotPlayers.filter((p) => p.paid).length;
          return {
            eventName: roster.eventName,
            referenceCode: roster.referenceCode,
            totalExpected: roster.players.length,
            totalMatched: matched,
            totalUnmatched: roster.players.length - matched,
            players: snapshotPlayers,
          };
        });

        // Walk-ins: anyone who paid but is not on any Reclub roster
        const walkIns: Array<{
          reclubUserId: number;
          reclubName: string;
          avatarUrl: string;
          courtpayPlayerId: string | null;
          courtpayName: string | null;
          paid: boolean;
          amount: number | null;
          partyCount: number;
          checkinTime: string | null;
          facePhotoUrl: string | null;
        }> = [];
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

          // Include if not on any roster (walk-in relative to Reclub)
          if (!reclubUserId || !allRosterIds.has(reclubUserId)) {
            walkIns.push({
              reclubUserId: reclubUserId ?? 0,
              reclubName: "",
              avatarUrl: "",
              courtpayPlayerId: playerId,
              courtpayName: playerName,
              paid: true,
              amount: p.amount,
              partyCount: typeof p.partyCount === "number" && p.partyCount > 1 ? p.partyCount : 1,
              checkinTime: p.createdAt.toISOString(),
              facePhotoUrl,
            });
          }
        }

        // Only persist snapshot when there's something meaningful to save
        if (eventSnapshots.length > 0 || walkIns.length > 0) {
          const totalExpected = eventSnapshots.reduce((s, e) => s + e.totalExpected, 0);
          const totalMatched = eventSnapshots.reduce((s, e) => s + e.totalMatched, 0);
          const totalWalkIns = walkIns.reduce((sum, w) => sum + (w.partyCount ?? 1), 0);

          reclubSnapshot = {
            events: eventSnapshots,
            eventName: rosters.map((r) => r.eventName).join(" + "),
            referenceCode: rosters[0]?.referenceCode ?? "",
            fetchedAt: session.date.toISOString(),
            closedAt: now.toISOString(),
            totalExpected,
            totalMatched,
            totalUnmatched: totalExpected - totalMatched,
            totalWalkIns,
            players: [
              ...eventSnapshots.flatMap((e) => e.players),
              ...walkIns,
            ],
          } as unknown as Prisma.InputJsonValue;
        }
      } catch (snapshotErr) {
        console.error("[session/close] Failed to build Reclub snapshot:", snapshotErr);
      }
    }

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
