import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    requireSuperAdmin(request.headers);

    const url = request.nextUrl;
    const search = url.searchParams.get("search")?.trim() || "";
    const venueId = url.searchParams.get("venueId") || "";
    const skillLevel = url.searchParams.get("skillLevel") || "";
    const status = url.searchParams.get("status") || "";
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

    const [players, total] = await Promise.all([
      prisma.player.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          queueEntries: {
            include: {
              session: {
                include: { venue: { select: { id: true, name: true } } },
              },
            },
            orderBy: { joinedAt: "desc" },
          },
        },
      }),
      prisma.player.count({ where }),
    ]);

    const result = players.map((player) => {
      const sessions = new Set<string>();
      const venueMap = new Map<string, { id: string; name: string; lastSeen: Date }>();
      let totalPlayMinutes = 0;
      let lastSeenDate: Date | null = null;
      let lastSeenVenue: string | null = null;

      for (const entry of player.queueEntries) {
        sessions.add(entry.sessionId);
        totalPlayMinutes += entry.totalPlayMinutesToday;

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

      const isActiveToday = player.queueEntries.some(
        (e) => e.session.status === "open" && ["waiting", "on_break", "playing", "assigned"].includes(e.status)
      );

      return {
        id: player.id,
        name: player.name,
        phone: player.phone,
        avatar: player.avatar,
        gender: player.gender,
        skillLevel: player.skillLevel,
        createdAt: player.createdAt,
        totalSessions: sessions.size,
        totalPlayMinutes,
        venues: Array.from(venueMap.values()),
        lastSeen: lastSeenDate ? { date: lastSeenDate, venue: lastSeenVenue } : null,
        isActiveToday,
      };
    });

    if (status === "inactive") {
      return json({ players: result.filter((p) => !p.isActiveToday), total, page, limit });
    }

    return json({ players: result, total, page, limit });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
