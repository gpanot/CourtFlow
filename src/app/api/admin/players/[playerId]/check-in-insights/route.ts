import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, notFound } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

const FACE_REGISTRATION_AUDIT_ACTIONS = [
  "walk_in_player_added_with_face",
  "face_manual_resolve_new_player",
  "walk_in_player_reactivated_with_face",
] as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> }
) {
  try {
    requireSuperAdmin(request.headers);
    const { playerId } = await params;

    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { id: true },
    });
    if (!player) return notFound("Player not found");

    const [
      faceRegisteredAudit,
      createdNewPlayerAttempt,
      kioskFaceCount,
      authCounts,
      kioskAttempts,
      authLogs,
    ] = await Promise.all([
      prisma.auditLog.findFirst({
        where: {
          targetId: playerId,
          action: { in: [...FACE_REGISTRATION_AUDIT_ACTIONS] },
        },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true, action: true },
      }),
      prisma.faceAttempt.findFirst({
        where: { matchedPlayerId: playerId, createdNewPlayer: true },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
      prisma.faceAttempt.count({
        where: { matchedPlayerId: playerId, resultType: "matched" },
      }),
      prisma.playerAppAuthLog.groupBy({
        by: ["method"],
        where: { playerId },
        _count: { _all: true },
      }),
      prisma.faceAttempt.findMany({
        where: { matchedPlayerId: playerId, resultType: "matched" },
        orderBy: { createdAt: "desc" },
        take: 40,
        select: {
          id: true,
          createdAt: true,
          queueNumberAssigned: true,
          eventId: true,
          kioskDeviceId: true,
        },
      }),
      prisma.playerAppAuthLog.findMany({
        where: { playerId },
        orderBy: { createdAt: "desc" },
        take: 40,
        select: { id: true, method: true, createdAt: true, sessionId: true },
      }),
    ]);

    const regFromAudit = faceRegisteredAudit?.createdAt ?? null;
    const regFromAttempt = createdNewPlayerAttempt?.createdAt ?? null;
    let faceRegisteredAt: string | null = null;
    if (regFromAudit && regFromAttempt) {
      faceRegisteredAt =
        regFromAudit.getTime() <= regFromAttempt.getTime()
          ? regFromAudit.toISOString()
          : regFromAttempt.toISOString();
    } else {
      faceRegisteredAt = (regFromAudit ?? regFromAttempt)?.toISOString() ?? null;
    }

    const countByMethod = Object.fromEntries(
      authCounts.map((r) => [r.method, r._count._all])
    ) as Record<string, number>;

    type TimelineKind = "kiosk_face" | "app_face" | "wristband" | "phone_otp";
    const timeline: { at: string; kind: TimelineKind; detail?: string }[] = [];

    for (const a of kioskAttempts) {
      const q = a.queueNumberAssigned;
      timeline.push({
        at: a.createdAt.toISOString(),
        kind: "kiosk_face",
        detail: q != null && q > 0 ? `Queue #${q}` : undefined,
      });
    }
    for (const log of authLogs) {
      if (log.method === "face_pwa") {
        timeline.push({ at: log.createdAt.toISOString(), kind: "app_face" });
      } else if (log.method === "wristband") {
        timeline.push({ at: log.createdAt.toISOString(), kind: "wristband" });
      } else if (log.method === "phone_otp") {
        timeline.push({ at: log.createdAt.toISOString(), kind: "phone_otp" });
      }
    }

    timeline.sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());
    const timelineTrimmed = timeline.slice(0, 35);

    return json({
      faceRegisteredAt,
      faceRegistrationSource: faceRegisteredAudit?.action ?? (createdNewPlayerAttempt ? "kiosk_new_player" : null),
      counts: {
        kioskFaceCheckIns: kioskFaceCount,
        appFaceSignIns: countByMethod.face_pwa ?? 0,
        wristbandSignIns: countByMethod.wristband ?? 0,
        phoneOtpSignIns: countByMethod.phone_otp ?? 0,
      },
      timeline: timelineTrimmed,
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
