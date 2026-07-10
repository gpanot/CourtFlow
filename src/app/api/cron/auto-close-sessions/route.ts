import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { emitToVenue } from "@/lib/socket-server";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * Auto-close sessions that have been open for more than 4 hours.
 * Called by a Railway cron job every hour (0 * * * *).
 * A session is therefore closed between 4h and ~5h after it opened,
 * depending on when the hourly tick fires.
 * Auth: Bearer CRON_SECRET header (required when CRON_SECRET env var is set).
 *
 * Mirrors the full behaviour of POST /api/sessions/[sessionId]/close:
 * - Builds the Reclub snapshot (roster matching + walk-ins)
 * - Closes queue entries, court assignments, courts
 * - Emits session:updated and player:notification socket events
 * - Writes audit log (no staffId — system action)
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - FOUR_HOURS_MS);

  try {
    // Fetch full session data so we can build the Reclub snapshot
    const staleSessions = await prisma.session.findMany({
      where: {
        status: "open",
        openedAt: { lte: cutoff },
      },
      select: {
        id: true,
        venueId: true,
        openedAt: true,
        date: true,
        reclubRoster: true,
        reclubReferenceCode: true,
        reclubEventName: true,
      },
    });

    if (staleSessions.length === 0) {
      return NextResponse.json({ closed: 0, sessions: [] });
    }

    const now = new Date();
    const closedIds: string[] = [];

    for (const session of staleSessions) {
      try {
        // ── Build Reclub snapshot (same logic as manual close) ────────────────
        let reclubSnapshot: Prisma.InputJsonValue | undefined;
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

          const confirmedPayments = await prisma.pendingPayment.findMany({
            where: { sessionId: session.id, status: "confirmed" },
            select: {
              id: true,
              amount: true,
              partyCount: true,
              createdAt: true,
              checkInPlayer: { select: { id: true, name: true, phone: true } },
              player: { select: { id: true, name: true, phone: true, reclubUserId: true, facePhotoPath: true, avatarPhotoPath: true } },
            },
          });

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

          const allRosterIds = new Set<number>();
          for (const r of rosters) {
            for (const p of r.players) allRosterIds.add(p.reclubUserId);
          }

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
          console.error(`[auto-close-sessions] Failed to build Reclub snapshot for session ${session.id}:`, snapshotErr);
        }

        // ── Close the session ─────────────────────────────────────────────────
        const updated = await prisma.session.update({
          where: { id: session.id },
          data: {
            status: "closed",
            closedAt: now,
            ...(reclubSnapshot ? { reclubSnapshot } : {}),
          },
        });

        await prisma.queueEntry.updateMany({
          where: {
            sessionId: session.id,
            status: { in: ["waiting", "assigned", "playing", "on_break"] },
          },
          data: { status: "left" },
        });

        await prisma.courtAssignment.updateMany({
          where: { sessionId: session.id, endedAt: null },
          data: { endedAt: now },
        });

        await prisma.court.updateMany({
          where: { venueId: session.venueId },
          data: {
            activeInSession: false,
            status: "idle",
            skipWarmupAfterMaintenance: false,
          },
        });

        await prisma.auditLog.create({
          data: {
            venueId: session.venueId,
            action: "session_auto_closed",
            targetId: session.id,
          },
        });

        emitToVenue(session.venueId, "session:updated", {
          session: updated,
          courts: [],
        });

        emitToVenue(session.venueId, "player:notification", {
          type: "session_closing",
          sessionId: session.id,
          message: "Today's session is ending — thanks for playing!",
        });

        closedIds.push(session.id);
        console.log(
          `[auto-close-sessions] Closed session ${session.id} (venue ${session.venueId}, opened ${session.openedAt.toISOString()}, snapshot=${reclubSnapshot ? "yes" : "no"})`
        );
      } catch (err) {
        console.error(
          `[auto-close-sessions] Failed to close session ${session.id}:`,
          err
        );
      }
    }

    return NextResponse.json({
      closed: closedIds.length,
      sessions: closedIds,
    });
  } catch (err) {
    console.error("[auto-close-sessions] Cron error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
