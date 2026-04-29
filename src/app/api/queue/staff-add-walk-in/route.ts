import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { emitToVenue } from "@/lib/socket-server";
import { SKILL_LEVELS, type SkillLevelType } from "@/lib/constants";
import {
  findLeftQueueEntryBySessionDisplayName,
  findQueueDisplayNameConflict,
} from "@/lib/queue-display-name";
import type { SkillLevel } from "@prisma/client";
import { initialRankingScoreForSkillLevel } from "@/lib/ranking";

function normalizeWalkInAvatar(raw: string | null | undefined): string {
  if (raw == null) return "🏓";
  const s = raw.trim();
  if (!s) return "🏓";
  if (s.length > 512) return "🏓";
  if (/^javascript:/i.test(s)) return "🏓";
  if (s.includes("<") || s.includes(">")) return "🏓";
  return s;
}

// Helper function to get next queue number
async function getNextQueueNumber(sessionId: string): Promise<number> {
  const lastEntry = await prisma.queueEntry.findFirst({
    where: {
      sessionId,
      queueNumber: { not: null },
    },
    orderBy: { queueNumber: "desc" },
  });

  return (lastEntry?.queueNumber || 0) + 1;
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireStaff(request.headers);
    const body = await parseBody<{
      venueId: string;
      name: string;
      gender: string;
      skillLevel: string;
      /** Optional; must be unique among players if provided. */
      phone?: string | null;
      /** Optional emoji or image URL/path (e.g. /test-avatars/00.jpg). */
      avatar?: string | null;
    }>(request);

    const { venueId, name, gender: genderRaw, skillLevel: skillRaw, phone: phoneRaw, avatar: avatarRaw } = body;
    if (!venueId?.trim()) return error("venueId is required", 400);
    const trimmedName = name?.trim() ?? "";
    if (!trimmedName) return error("Name is required", 400);
    if (genderRaw !== "male" && genderRaw !== "female") {
      return error("Gender must be male or female", 400);
    }
    const gender = genderRaw as "male" | "female";
    if (!SKILL_LEVELS.includes(skillRaw as SkillLevelType)) {
      return error("Invalid skill level", 400);
    }
    const skillLevel = skillRaw as SkillLevelType;

    const phoneTrimmed =
      typeof phoneRaw === "string" ? phoneRaw.trim() : "";
    const phone = phoneTrimmed.length > 0 ? phoneTrimmed : `walkin:${randomUUID()}`;

    const session = await prisma.session.findFirst({
      where: { venueId, status: "open" },
    });
    if (!session) return error("No active session found", 404);

    const conflict = await findQueueDisplayNameConflict(session.id, trimmedName);
    if (conflict) {
      return error(`"${conflict}" is already in the queue for this session`, 409);
    }

    const leftSameName = await findLeftQueueEntryBySessionDisplayName(session.id, trimmedName);
    if (leftSameName) {
      const queueNumber =
        leftSameName.queueNumber != null
          ? leftSameName.queueNumber
          : await getNextQueueNumber(session.id);
      // Re-activate as checked-in (on_break = checked in, not in queue)
      const entry = await prisma.queueEntry.update({
        where: { id: leftSameName.entryId },
        data: {
          status: "on_break",
          queueNumber,
          groupId: null,
          breakUntil: null,
        },
        include: { player: true },
      });

      await prisma.auditLog.create({
        data: {
          venueId,
          staffId: auth.id,
          action: "walk_in_player_reactivated",
          targetId: entry.playerId,
          metadata: {
            queueEntryId: entry.id,
            sessionId: session.id,
            priorStatus: "left",
          },
        },
      });

      const allEntries = await prisma.queueEntry.findMany({
        where: { sessionId: session.id, status: { in: ["waiting", "on_break"] } },
        include: {
          player: true,
          group: { include: { queueEntries: { where: { status: { not: "left" } }, include: { player: true } } } },
        },
        orderBy: { joinedAt: "asc" },
      });

      emitToVenue(venueId, "queue:updated", allEntries);

      return json(
        {
          success: true,
          reactivated: true,
          player: {
            id: entry.player.id,
            name: entry.player.name,
            gender: entry.player.gender,
            skillLevel: entry.player.skillLevel,
            avatar: entry.player.avatar,
          },
          queueEntryId: entry.id,
          queueNumber: entry.queueNumber,
        },
        200
      );
    }

    let player;
    try {
      player = await prisma.player.create({
        data: {
          name: trimmedName,
          phone,
          gender,
          skillLevel,
          isWalkIn: true,
          avatar: normalizeWalkInAvatar(
            typeof avatarRaw === "string" ? avatarRaw : null
          ),
          rankingScore: initialRankingScoreForSkillLevel(skillLevel as SkillLevel),
        },
      });
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") {
        return error("A player with this phone number already exists", 409);
      }
      throw e;
    }

    // Create as checked-in (on_break = checked in, not in queue)
    const entry = await prisma.queueEntry.create({
      data: {
        sessionId: session.id,
        playerId: player.id,
        status: "on_break",
        queueNumber: await getNextQueueNumber(session.id),
      },
      include: { player: true },
    });

    await prisma.auditLog.create({
      data: {
        venueId,
        staffId: auth.id,
        action: "walk_in_player_added",
        targetId: player.id,
        metadata: { queueEntryId: entry.id, sessionId: session.id },
      },
    });

    const allEntries = await prisma.queueEntry.findMany({
      where: { sessionId: session.id, status: { in: ["waiting", "on_break"] } },
      include: {
        player: true,
        group: { include: { queueEntries: { where: { status: { not: "left" } }, include: { player: true } } } },
      },
      orderBy: { joinedAt: "asc" },
    });

    emitToVenue(venueId, "queue:updated", allEntries);

    return json(
      {
        success: true,
        player: {
          id: player.id,
          name: player.name,
          gender: player.gender,
          skillLevel: player.skillLevel,
          avatar: player.avatar,
        },
        queueEntryId: entry.id,
      },
      201
    );
  } catch (e) {
    console.error("[Staff Add Walk-in] Error:", e);
    return error((e as Error).message, 500);
  }
}
