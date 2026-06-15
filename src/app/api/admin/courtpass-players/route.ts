import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { getAuthorizedVenueIds } from "@/lib/venue-scope";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export async function GET(request: NextRequest) {
  try {
    const auth = requireStaff(request.headers);
    const { searchParams } = request.nextUrl;
    const venueId = searchParams.get("venueId");
    const search = searchParams.get("search")?.trim() ?? "";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const skip = (page - 1) * PAGE_SIZE;

    if (!venueId) return error("venueId is required", 400);

    // Scope-check: ensure this staff member can access the venue
    if (auth.role !== "superadmin") {
      const authorizedIds = await getAuthorizedVenueIds(auth);
      if (!authorizedIds.includes(venueId)) {
        return error("Forbidden", 403);
      }
    }

    const searchLower = search.toLowerCase();

    // ── 1. CourtPass players: from Player model (have bookings/memberships at this venue) ──
    const playerWhere = search
      ? {
          AND: [
            {
              OR: [
                { bookings: { some: { venueId } } },
                { memberships: { some: { venueId } } },
                { registrationVenueId: venueId },
              ],
            },
            {
              OR: [
                { name: { contains: search, mode: "insensitive" as const } },
                { phone: { contains: search } },
                { email: { contains: search, mode: "insensitive" as const } },
              ],
            },
          ],
        }
      : {
          OR: [
            { bookings: { some: { venueId } } },
            { memberships: { some: { venueId } } },
            { registrationVenueId: venueId },
          ],
        };

    const [players, playersTotal] = await Promise.all([
      prisma.player.findMany({
        where: playerWhere,
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          avatar: true,
          facePhotoPath: true,
          avatarPhotoPath: true,
          memberships: {
            where: { venueId },
            include: { tier: { select: { name: true } } },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          bookings: {
            where: { venueId, paymentStatus: { not: "PAID" }, status: "confirmed" },
            select: { priceValue: true, paymentStatus: true },
          },
          playerNotes: {
            where: { venueId },
            select: { content: true, updatedAt: true },
            take: 1,
          },
        },
        orderBy: { name: "asc" },
        skip,
        take: PAGE_SIZE,
      }),
      prisma.player.count({ where: playerWhere }),
    ]);

    // ── 2. CourtPay players: from CheckInPlayer model ──
    const cpWhere = search
      ? {
          AND: [
            { venueId },
            {
              OR: [
                { name: { contains: search, mode: "insensitive" as const } },
                { phone: { contains: search } },
              ],
            },
          ],
        }
      : { venueId };

    const [cpPlayers, cpTotal] = await Promise.all([
      prisma.checkInPlayer.findMany({
        where: cpWhere,
        select: {
          id: true,
          name: true,
          phone: true,
          gender: true,
          skillLevel: true,
          createdAt: true,
          checkIns: {
            orderBy: { checkedInAt: "desc" },
            take: 1,
            select: { checkedInAt: true },
          },
          _count: { select: { checkIns: true } },
        },
        orderBy: { name: "asc" },
        skip,
        take: PAGE_SIZE,
      }),
      prisma.checkInPlayer.count({ where: cpWhere }),
    ]);

    // ── 3. Fetch check-in counts + last check-in for Player-type entries via linked CheckInPlayer ──
    const playerPhones = players.map((p) => p.phone);
    const linkedCpPlayers = await prisma.checkInPlayer.findMany({
      where: { phone: { in: playerPhones }, venueId },
      select: {
        id: true,
        phone: true,
        _count: { select: { checkIns: true } },
        checkIns: {
          orderBy: { checkedInAt: "desc" },
          take: 1,
          select: { checkedInAt: true },
        },
      },
    });

    const cpByPhone = new Map(linkedCpPlayers.map((cp) => [cp.phone, cp]));
    const checkInCountMap = new Map(players.map((p) => {
      const cp = cpByPhone.get(p.phone);
      return [p.id, cp?._count.checkIns ?? 0];
    }));
    const lastCheckInMap = new Map(players.map((p) => {
      const cp = cpByPhone.get(p.phone);
      return [p.id, cp?.checkIns[0]?.checkedInAt ?? null];
    }));

    // ── 4. Pending balance for Player-type entries ──
    const overduePayments = await prisma.membershipPayment.findMany({
      where: {
        membership: { playerId: { in: players.map((p) => p.id) }, venueId },
        status: { in: ["OVERDUE", "UNPAID"] },
      },
      select: { amountValue: true, membership: { select: { playerId: true } } },
    });

    const pendingBalanceMap = new Map<string, number>();
    for (const p of overduePayments) {
      const prev = pendingBalanceMap.get(p.membership.playerId) ?? 0;
      pendingBalanceMap.set(p.membership.playerId, prev + p.amountValue);
    }

    // ── 5. Merge + deduplicate by phone ──
    const phonesSeen = new Set<string>();
    const result: Array<{
      id: string;
      source: "courtpass" | "courtpay";
      name: string;
      phone: string;
      email: string | null;
      avatar?: string;
      facePhotoPath: string | null;
      avatarPhotoPath: string | null;
      membershipName: string | null;
      membershipStatus: string | null;
      checkInCount: number;
      lastCheckIn: string | null;
      pendingBalance: number;
    }> = [];

    for (const p of players) {
      phonesSeen.add(p.phone);
      const membership = p.memberships[0] ?? null;
      result.push({
        id: p.id,
        source: "courtpass",
        name: p.name,
        phone: p.phone,
        email: p.email ?? null,
        avatar: p.avatar,
        facePhotoPath: p.facePhotoPath,
        avatarPhotoPath: p.avatarPhotoPath,
        membershipName: membership?.tier?.name ?? null,
        membershipStatus: membership?.status ?? null,
        checkInCount: checkInCountMap.get(p.id) ?? 0,
        lastCheckIn: lastCheckInMap.get(p.id)?.toISOString() ?? null,
        pendingBalance: pendingBalanceMap.get(p.id) ?? 0,
      });
    }

    for (const cp of cpPlayers) {
      // Skip if this phone was already added from CourtPass players
      if (phonesSeen.has(cp.phone)) continue;
      result.push({
        id: cp.id,
        source: "courtpay",
        name: cp.name,
        phone: cp.phone,
        email: null,
        facePhotoPath: null,
        avatarPhotoPath: null,
        membershipName: null,
        membershipStatus: null,
        checkInCount: cp._count.checkIns,
        lastCheckIn: cp.checkIns[0]?.checkedInAt?.toISOString() ?? null,
        pendingBalance: 0,
      });
    }

    // Sort merged list alphabetically by name
    result.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

    return json({
      players: result,
      total: playersTotal + cpTotal,
      page,
      pageSize: PAGE_SIZE,
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
