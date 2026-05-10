import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import type { SkillLevel } from "@prisma/client";
import { initialRankingScoreForSkillLevel } from "@/lib/ranking";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

interface AdminPlayersStatsPayload {
  totalPlayers: number;
  activeToday: number;
  newThisWeek: number;
  newThisMonth: number;
  totalPlayMinutes: number;
  totalWaitMinutes: number;
  waitPlayRatio: number;
  skillDistribution: Record<string, number>;
}

const ADMIN_PLAYERS_STATS_TTL_MS = 30_000;
let adminPlayersStatsCache: { expiresAt: number; stats: AdminPlayersStatsPayload } | null = null;

async function getAdminPlayersStats(now: Date): Promise<AdminPlayersStatsPayload> {
  if (adminPlayersStatsCache && adminPlayersStatsCache.expiresAt > now.getTime()) {
    return adminPlayersStatsCache.stats;
  }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [totalPlayers, newThisWeek, newThisMonth, skillCounts, activeEntries, globalPresenceAgg] = await Promise.all([
    prisma.player.count(),
    prisma.player.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.player.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.player.groupBy({ by: ["skillLevel"], _count: true }),
    prisma.queueEntry.findMany({
      where: {
        session: { status: "open" },
        status: { in: ["waiting", "on_break", "playing", "assigned"] },
      },
      select: { playerId: true },
      distinct: ["playerId"],
    }),
    prisma.$queryRaw<Array<{ globalPlayMinutes: bigint | number | null; globalWaitMinutes: bigint | number | null }>>`
      SELECT
        COALESCE(SUM(q.total_play_minutes_today), 0) AS "globalPlayMinutes",
        COALESCE(
          SUM(
            GREATEST(
              0,
              (EXTRACT(EPOCH FROM (COALESCE(s.closed_at, NOW()) - q.joined_at)) / 60)::int
              - q.total_play_minutes_today
            )
          ),
          0
        ) AS "globalWaitMinutes"
      FROM queue_entries q
      JOIN sessions s ON s.id = q.session_id
    `,
  ]);

  const globalAgg = globalPresenceAgg[0];
  const globalPlayMinutes = Number(globalAgg?.globalPlayMinutes ?? 0);
  const globalWaitMinutes = Number(globalAgg?.globalWaitMinutes ?? 0);
  const totalPresence = globalWaitMinutes + globalPlayMinutes;
  const waitPlayRatio = totalPresence > 0
    ? Math.round((globalWaitMinutes / totalPresence) * 100)
    : 0;

  const stats: AdminPlayersStatsPayload = {
    totalPlayers,
    activeToday: activeEntries.length,
    newThisWeek,
    newThisMonth,
    totalPlayMinutes: globalPlayMinutes,
    totalWaitMinutes: globalWaitMinutes,
    waitPlayRatio,
    skillDistribution: Object.fromEntries(
      skillCounts.map((s) => [s.skillLevel, s._count])
    ),
  };

  adminPlayersStatsCache = {
    stats,
    expiresAt: now.getTime() + ADMIN_PLAYERS_STATS_TTL_MS,
  };
  return stats;
}

export async function GET(request: NextRequest) {
  try {
    requireSuperAdmin(request.headers);

    const url = request.nextUrl;
    const search = url.searchParams.get("search")?.trim() || "";
    const venueId = url.searchParams.get("venueId") || "";
    const skillLevel = url.searchParams.get("skillLevel") || "";
    const status = url.searchParams.get("status") || "";
    const gender = url.searchParams.get("gender") || "";
    const face = url.searchParams.get("face") || "";
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const limit = 50;

    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
      ];
    }

    if (skillLevel) {
      where.skillLevel = skillLevel;
    }

    if (gender) {
      where.gender = gender;
    }

    if (face === "no_face") {
      where.faceSubjectId = null;
    }

    if (venueId) {
      where.queueEntries = { some: { session: { venueId } } };
    }

    if (status === "active") {
      where.queueEntries = {
        ...((where.queueEntries as object) || {}),
        some: {
          ...((where.queueEntries as Record<string, unknown>)?.some as object || {}),
          session: {
            ...((((where.queueEntries as Record<string, unknown>)?.some as Record<string, unknown>)?.session as object) || {}),
            status: "open",
          },
          status: { in: ["waiting", "on_break", "playing", "assigned"] },
        },
      };
    }

    // Build base where without gender/face quick-filter to get accurate counts
    const baseWhere: Record<string, unknown> = {};
    if (search) {
      baseWhere.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
      ];
    }
    if (skillLevel) baseWhere.skillLevel = skillLevel;
    if (venueId) baseWhere.queueEntries = { some: { session: { venueId } } };
    if (status === "active") {
      baseWhere.queueEntries = {
        ...((baseWhere.queueEntries as object) || {}),
        some: {
          ...((baseWhere.queueEntries as Record<string, unknown>)?.some as object || {}),
          session: {
            ...((((baseWhere.queueEntries as Record<string, unknown>)?.some as Record<string, unknown>)?.session as object) || {}),
            status: "open",
          },
          status: { in: ["waiting", "on_break", "playing", "assigned"] },
        },
      };
    }

    const now = new Date();
    const [players, total, stats, countAll, countMale, countFemale, countNoFace] = await Promise.all([
      prisma.player.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          queueEntries: {
            select: {
              sessionId: true,
              joinedAt: true,
              totalPlayMinutesToday: true,
              status: true,
              session: {
                select: {
                  status: true,
                  closedAt: true,
                  venue: { select: { id: true, name: true } },
                },
              },
            },
            orderBy: { joinedAt: "desc" },
          },
          stickerPacks: { select: { sticker1Url: true, sticker2Url: true, sticker3Url: true, sticker4Url: true }, orderBy: { createdAt: "desc" as const }, take: 1 },
        },
      }),
      prisma.player.count({ where }),
      getAdminPlayersStats(now),
      prisma.player.count({ where: baseWhere }),
      prisma.player.count({ where: { ...baseWhere, gender: "male" } }),
      prisma.player.count({ where: { ...baseWhere, gender: "female" } }),
      prisma.player.count({ where: { ...baseWhere, faceSubjectId: null } }),
    ]);

    const playerIds = players.map((p) => p.id);
    const gameAssignments = playerIds.length > 0
      ? await prisma.courtAssignment.findMany({
          where: { playerIds: { hasSome: playerIds }, isWarmup: false },
          select: { playerIds: true },
        })
      : [];
    const gameCounts: Record<string, number> = {};
    const pidSet = new Set(playerIds);
    for (const a of gameAssignments) {
      for (const pid of a.playerIds) {
        if (pidSet.has(pid)) gameCounts[pid] = (gameCounts[pid] || 0) + 1;
      }
    }

    const result = players.map((player) => {
      const sessions = new Set<string>();
      const venueMap = new Map<string, { id: string; name: string; lastSeen: Date }>();
      let totalPlayMinutes = 0;
      let totalWaitMinutes = 0;
      let lastSeenDate: Date | null = null;
      let lastSeenVenue: string | null = null;

      for (const entry of player.queueEntries) {
        sessions.add(entry.sessionId);
        totalPlayMinutes += entry.totalPlayMinutesToday;

        const sessionEnd = entry.session.closedAt ?? now;
        const presenceMin = Math.max(
          0,
          Math.round((sessionEnd.getTime() - entry.joinedAt.getTime()) / 60000)
        );
        totalWaitMinutes += Math.max(0, presenceMin - entry.totalPlayMinutesToday);

        const v = entry.session.venue;
        const existing = venueMap.get(v.id);
        if (!existing || entry.joinedAt > existing.lastSeen) {
          venueMap.set(v.id, { id: v.id, name: v.name, lastSeen: entry.joinedAt });
        }

        if (!lastSeenDate || entry.joinedAt > lastSeenDate) {
          lastSeenDate = entry.joinedAt;
          lastSeenVenue = v.name;
        }
      }

      const totalPresencePlayer = totalPlayMinutes + totalWaitMinutes;
      const playerWaitPlayRatio = totalPresencePlayer > 0
        ? Math.round((totalWaitMinutes / totalPresencePlayer) * 100)
        : 0;

      const isActiveToday = player.queueEntries.some(
        (e) => e.session.status === "open" && ["waiting", "on_break", "playing", "assigned"].includes(e.status)
      );

      return {
        id: player.id,
        name: player.name,
        phone: player.phone,
        avatar: player.avatar,
        hasFace: !!player.faceSubjectId,
        faceSubjectId: player.faceSubjectId,
        isWalkIn: player.isWalkIn,
        facePhotoPath: player.facePhotoPath,
        avatarPhotoPath: player.avatarPhotoPath,
        gender: player.gender,
        skillLevel: player.skillLevel,
        createdAt: player.createdAt,
        rankingScore: player.rankingScore,
        rankingCount: player.rankingCount,
        reclubUserId: player.reclubUserId ?? null,
        totalSessions: sessions.size,
        totalGames: gameCounts[player.id] || 0,
        totalPlayMinutes,
        totalWaitMinutes,
        waitPlayRatio: playerWaitPlayRatio,
        venues: Array.from(venueMap.values()),
        lastSeen: lastSeenDate ? { date: lastSeenDate, venue: lastSeenVenue } : null,
        isActiveToday,
        hasStickers: !!(
          player.stickerPacks[0]?.sticker1Url ||
          player.stickerPacks[0]?.sticker2Url ||
          player.stickerPacks[0]?.sticker3Url ||
          player.stickerPacks[0]?.sticker4Url
        ),
      };
    });

    const filterCounts = { all: countAll, male: countMale, female: countFemale, no_face: countNoFace };

    if (status === "inactive") {
      return json({ players: result.filter((p) => !p.isActiveToday), total, page, limit, stats, filterCounts });
    }

    return json({ players: result, total, page, limit, stats, filterCounts });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    requireSuperAdmin(request.headers);
    const body = await parseBody<{
      name: string;
      phone: string;
      gender: string;
      skillLevel?: string;
      avatar?: string;
    }>(request);

    if (!body.name?.trim()) return error("Name is required", 400);
    if (!body.phone?.trim()) return error("Phone is required", 400);
    if (!body.gender) return error("Gender is required", 400);

    const rawSkill = ((body.skillLevel as string) || "beginner").toLowerCase();
    const skill: SkillLevel = ["beginner", "intermediate", "advanced", "pro"].includes(rawSkill)
      ? (rawSkill as SkillLevel)
      : "beginner";
    const player = await prisma.player.create({
      data: {
        name: body.name.trim(),
        phone: body.phone.trim(),
        gender: body.gender as never,
        skillLevel: skill,
        avatar: body.avatar || "🏓",
        rankingScore: initialRankingScoreForSkillLevel(skill),
        registrationAt: new Date(),
      },
    });

    return json(player, 201);
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      return error("A player with this phone number already exists", 409);
    }
    return error((e as Error).message, 500);
  }
}
