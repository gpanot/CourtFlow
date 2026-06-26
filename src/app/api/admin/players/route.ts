import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import type { SkillLevel } from "@prisma/client";
import { initialRankingScoreForSkillLevel } from "@/lib/ranking";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireManagerOrSuperAdmin } from "@/lib/auth";
import { getAuthorizedVenueIds } from "@/lib/venue-scope";
import { enqueueStickerJobIfNeeded } from "@/lib/sticker-queue";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";
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

async function getAdminPlayersStats(now: Date, venueIds: string[] | null): Promise<AdminPlayersStatsPayload> {
  // Only cache the global (superadmin) version
  if (!venueIds && adminPlayersStatsCache && adminPlayersStatsCache.expiresAt > now.getTime()) {
    return adminPlayersStatsCache.stats;
  }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Base player filter: scope to manager's venues if applicable
  const playerVenueFilter = venueIds
    ? {
        OR: [
          { registrationVenueId: { in: venueIds } },
          { queueEntries: { some: { session: { venueId: { in: venueIds } } } } },
        ],
      }
    : {};

  const sessionVenueFilter = venueIds ? { venueId: { in: venueIds } } : {};

  const [totalPlayers, newThisWeek, newThisMonth, skillCounts, activeEntries] = await Promise.all([
    prisma.player.count({ where: playerVenueFilter }),
    prisma.player.count({ where: { ...playerVenueFilter, createdAt: { gte: sevenDaysAgo } } }),
    prisma.player.count({ where: { ...playerVenueFilter, createdAt: { gte: thirtyDaysAgo } } }),
    prisma.player.groupBy({ by: ["skillLevel"], _count: true, where: playerVenueFilter }),
    prisma.queueEntry.findMany({
      where: {
        session: { status: "open", ...sessionVenueFilter },
        status: { in: ["waiting", "on_break", "playing", "assigned"] },
      },
      select: { playerId: true },
      distinct: ["playerId"],
    }),
  ]);

  // Aggregate play/wait minutes scoped to venue if needed
  let globalPlayMinutes = 0;
  let globalWaitMinutes = 0;
  if (venueIds) {
    const agg = await prisma.queueEntry.findMany({
      where: { session: { venueId: { in: venueIds } } },
      select: {
        totalPlayMinutesToday: true,
        joinedAt: true,
        session: { select: { closedAt: true } },
      },
    });
    for (const e of agg) {
      globalPlayMinutes += e.totalPlayMinutesToday;
      const sessionEnd = e.session.closedAt ?? now;
      const presenceMin = Math.max(0, Math.round((sessionEnd.getTime() - e.joinedAt.getTime()) / 60000));
      globalWaitMinutes += Math.max(0, presenceMin - e.totalPlayMinutesToday);
    }
  } else {
    const globalPresenceAgg = await prisma.$queryRaw<Array<{ globalPlayMinutes: bigint | number | null; globalWaitMinutes: bigint | number | null }>>`
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
    `;
    const globalAgg = globalPresenceAgg[0];
    globalPlayMinutes = Number(globalAgg?.globalPlayMinutes ?? 0);
    globalWaitMinutes = Number(globalAgg?.globalWaitMinutes ?? 0);
  }

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

  if (!venueIds) {
    adminPlayersStatsCache = {
      stats,
      expiresAt: now.getTime() + ADMIN_PLAYERS_STATS_TTL_MS,
    };
  }
  return stats;
}

export async function GET(request: NextRequest) {
  try {
    const auth = requireManagerOrSuperAdmin(request.headers);
    const authorizedVenueIds = auth.role === "manager" ? await getAuthorizedVenueIds(auth) : null;

    const url = request.nextUrl;
    const search = url.searchParams.get("search")?.trim() || "";
    const venueId = url.searchParams.get("venueId") || "";
    const skillLevel = url.searchParams.get("skillLevel") || "";
    const status = url.searchParams.get("status") || "";
    const gender = url.searchParams.get("gender") || "";
    const face = url.searchParams.get("face") || "";
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const limit = 50;
    const sortKey = url.searchParams.get("sortKey") || "";
    const sortDir = (url.searchParams.get("sortDir") || "desc") as "asc" | "desc";

    // DB-native sort keys can be pushed directly to Prisma orderBy
    const DB_SORT_MAP: Record<string, Record<string, string>> = {
      name: { name: sortDir },
      phone: { phone: sortDir },
      gender: { gender: sortDir },
      skillLevel: { skillLevel: sortDir },
    };
    const isDbSort = sortKey in DB_SORT_MAP;
    // Computed sort keys require fetching all records then sorting in JS
    const isComputedSort = !isDbSort && !!sortKey;

    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
        { email: { contains: search, mode: "insensitive" } },
        { accounts: { some: { providerAccountId: { contains: search, mode: "insensitive" } } } },
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
      // If manager, ensure they can only filter by their own venues
      if (authorizedVenueIds && !authorizedVenueIds.includes(venueId)) {
        return json({ players: [], stats: null, totalCount: 0, page: 1, limit, totalPages: 0, faceCounts: { withFace: 0, noFace: 0 } });
      }
      where.queueEntries = { some: { session: { venueId } } };
    }

    // Manager isolation: only see players who registered at or have queue entries in their venues
    if (authorizedVenueIds && !venueId) {
      if (!where.AND) where.AND = [];
      (where.AND as unknown[]).push({
        OR: [
          { registrationVenueId: { in: authorizedVenueIds } },
          { queueEntries: { some: { session: { venueId: { in: authorizedVenueIds } } } } },
        ],
      });
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
        { email: { contains: search, mode: "insensitive" } },
        { accounts: { some: { providerAccountId: { contains: search, mode: "insensitive" } } } },
      ];
    }
    if (skillLevel) baseWhere.skillLevel = skillLevel;
    if (venueId) baseWhere.queueEntries = { some: { session: { venueId } } };
    if (authorizedVenueIds && !venueId) {
      if (!baseWhere.AND) baseWhere.AND = [];
      (baseWhere.AND as unknown[]).push({
        OR: [
          { registrationVenueId: { in: authorizedVenueIds } },
          { queueEntries: { some: { session: { venueId: { in: authorizedVenueIds } } } } },
        ],
      });
    }
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
    const playerInclude = {
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
        orderBy: { joinedAt: "desc" as const },
      },
      stickerPacks: {
        select: { sticker1Url: true, sticker2Url: true, sticker3Url: true, sticker4Url: true },
        orderBy: { createdAt: "desc" as const },
        take: 1,
      },
    };

    const [players, total, stats, countAll, countMale, countFemale, countNoFace] = await Promise.all([
      prisma.player.findMany({
        where,
        // For computed sorts we fetch ALL records (no pagination) — we sort+paginate in JS below
        orderBy: isDbSort ? DB_SORT_MAP[sortKey] : { createdAt: "desc" },
        ...(isComputedSort ? {} : { skip: (page - 1) * limit, take: limit }),
        include: playerInclude,
      }),
      prisma.player.count({ where }),
      getAdminPlayersStats(now, authorizedVenueIds),
      prisma.player.count({ where: baseWhere }),
      prisma.player.count({ where: { ...baseWhere, gender: "male" } }),
      prisma.player.count({ where: { ...baseWhere, gender: "female" } }),
      prisma.player.count({ where: { ...baseWhere, faceSubjectId: null } }),
    ]);

    const playerIds = players.map((p) => p.id);
    const playerPhones = players.map((p) => p.phone).filter(Boolean);

    const [gameAssignments, checkInPlayerRows] = await Promise.all([
      playerIds.length > 0
        ? prisma.courtAssignment.findMany({
            where: { playerIds: { hasSome: playerIds }, isWarmup: false },
            select: { playerIds: true },
          })
        : Promise.resolve([]),
      playerPhones.length > 0
        ? prisma.checkInPlayer.findMany({
            where: { phone: { in: playerPhones } },
            select: {
              phone: true,
              _count: { select: { checkIns: true } },
            },
          })
        : Promise.resolve([]),
    ]);

    const gameCounts: Record<string, number> = {};
    const pidSet = new Set(playerIds);
    for (const a of gameAssignments) {
      for (const pid of a.playerIds) {
        if (pidSet.has(pid)) gameCounts[pid] = (gameCounts[pid] || 0) + 1;
      }
    }

    // Aggregate check-in counts by phone (a player may have CheckInPlayer rows across multiple venues)
    const checkInCountByPhone: Record<string, number> = {};
    for (const row of checkInPlayerRows) {
      checkInCountByPhone[row.phone] = (checkInCountByPhone[row.phone] || 0) + row._count.checkIns;
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
        checkInCount: checkInCountByPhone[player.phone] ?? 0,
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

    let finalResult = status === "inactive" ? result.filter((p) => !p.isActiveToday) : result;

    if (isComputedSort) {
      // Sort the full result set in JS, then paginate manually
      const SKILL_ORDER_MAP: Record<string, number> = { beginner: 0, intermediate: 1, advanced: 2, pro: 3 };
      finalResult = [...finalResult].sort((a, b) => {
        let cmp = 0;
        switch (sortKey) {
          case "totalSessions": cmp = a.totalSessions - b.totalSessions; break;
          case "totalGames": cmp = a.totalGames - b.totalGames; break;
          case "totalPlayMinutes": cmp = a.totalPlayMinutes - b.totalPlayMinutes; break;
          case "totalWaitMinutes": cmp = a.totalWaitMinutes - b.totalWaitMinutes; break;
          case "waitPlayRatio": cmp = a.waitPlayRatio - b.waitPlayRatio; break;
          case "venues": cmp = a.venues.length - b.venues.length; break;
          case "stickers": cmp = (a.hasStickers ? 1 : 0) - (b.hasStickers ? 1 : 0); break;
          case "checkInCount": cmp = (a.checkInCount ?? 0) - (b.checkInCount ?? 0); break;
          case "skillLevel": cmp = (SKILL_ORDER_MAP[a.skillLevel] ?? 0) - (SKILL_ORDER_MAP[b.skillLevel] ?? 0); break;
        }
        return sortDir === "asc" ? cmp : -cmp;
      });
      finalResult = finalResult.slice((page - 1) * limit, page * limit);
    }

    return json({ players: finalResult, total, page, limit, stats, filterCounts });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    requireManagerOrSuperAdmin(request.headers);
    const body = await parseBody<{
      name: string;
      phone: string;
      gender: string;
      skillLevel?: string;
      avatar?: string;
      email?: string;
      password?: string;
    }>(request);

    if (!body.name?.trim()) return error("Name is required", 400);
    if (!body.phone?.trim()) return error("Phone is required", 400);
    if (!body.gender) return error("Gender is required", 400);

    // If email/password provided, validate them before touching the DB
    const normalizedEmail = body.email?.toLowerCase().trim() ?? null;
    if (normalizedEmail !== null) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))
        return error("Invalid email address", 400);
      if (!body.password || body.password.length < 8)
        return error("Password must be at least 8 characters", 400);

      const existingAccount = await prisma.playerAccount.findUnique({
        where: {
          provider_providerAccountId: {
            provider: "credentials",
            providerAccountId: normalizedEmail,
          },
        },
      });
      if (existingAccount)
        return error("An account with this email already exists", 409);
    }

    const rawSkill = ((body.skillLevel as string) || "beginner").toLowerCase();
    const skill: SkillLevel = ["beginner", "intermediate", "advanced", "pro"].includes(rawSkill)
      ? (rawSkill as SkillLevel)
      : "beginner";

    const player = await prisma.player.create({
      data: {
        name: body.name.trim(),
        phone: body.phone.trim(),
        email: normalizedEmail ?? undefined,
        gender: body.gender as never,
        skillLevel: skill,
        avatar: body.avatar || "🏓",
        rankingScore: initialRankingScoreForSkillLevel(skill),
        registrationAt: new Date(),
      },
    });

    // Create login account if email + password were supplied
    if (normalizedEmail && body.password) {
      const passwordHash = await bcrypt.hash(body.password, 12);
      await prisma.playerAccount.create({
        data: {
          playerId: player.id,
          provider: "credentials",
          providerAccountId: normalizedEmail,
          email: normalizedEmail,
          name: body.name.trim(),
          passwordHash,
          emailVerified: false,
        },
      });
    }

    enqueueStickerJobIfNeeded(player.id, player.gender).catch(console.error);

    return json(player, 201);
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      return error("A player with this phone number already exists", 409);
    }
    return error((e as Error).message, 500);
  }
}
