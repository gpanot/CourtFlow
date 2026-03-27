import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { emitToVenue } from "@/lib/socket-server";
import { SKILL_LEVELS, type SkillLevelType } from "@/lib/constants";
import { findQueueDisplayNameConflict } from "@/lib/queue-display-name";

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
    }>(request);

    const { venueId, name, gender: genderRaw, skillLevel: skillRaw, phone: phoneRaw } = body;
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

    let player;
    try {
      player = await prisma.player.create({
        data: {
          name: trimmedName,
          phone,
          gender,
          skillLevel,
          avatar: "🏓",
        },
      });
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") {
        return error("A player with this phone number already exists", 409);
      }
      throw e;
    }

    const entry = await prisma.queueEntry.create({
      data: {
        sessionId: session.id,
        playerId: player.id,
        status: "waiting",
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
