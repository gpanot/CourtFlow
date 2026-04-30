import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";

const RECLUB_API = "https://api.reclub.co";
const RECLUB_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
  "x-output-casing": "camelCase",
  Accept: "application/json",
};

async function fetchReclubProfile(reclubUserId: number): Promise<{ name: string; avatarUrl: string } | null> {
  try {
    const res = await fetch(
      `${RECLUB_API}/players/userIds?userIds=${reclubUserId}&scopes=BASIC_PROFILE`,
      { headers: RECLUB_HEADERS }
    );
    if (!res.ok) return null;
    const data = await res.json() as { players?: Array<{ userId: number; name: string; imageUrl: string }> };
    const p = data.players?.find((x) => x.userId === reclubUserId);
    if (!p) return null;
    return { name: p.name, avatarUrl: p.imageUrl };
  } catch {
    return null;
  }
}

/**
 * GET /api/courtpay/staff/boss/player?playerId=...&source=courtpay|self
 * PATCH /api/courtpay/staff/boss/player  { playerId, source, name, phone, gender, skillLevel }
 *
 * Returns / updates a single player profile.
 * Phone uniqueness is enforced: returns 409 if the new phone is already taken.
 */
export async function GET(req: Request) {
  try {
    requireStaff(req.headers);
    const { searchParams } = new URL(req.url);
    const playerId = searchParams.get("playerId");
    const source = searchParams.get("source") ?? "courtpay";

    if (!playerId) {
      return NextResponse.json({ error: "playerId required" }, { status: 400 });
    }

    if (source === "courtpay") {
      const player = await prisma.checkInPlayer.findUnique({
        where: { id: playerId },
        include: {
          venue: { select: { name: true } },
          checkIns: {
            orderBy: { checkedInAt: "desc" },
            take: 50,
            select: { id: true, checkedInAt: true, source: true },
          },
          subscriptions: {
            orderBy: { activatedAt: "desc" },
            take: 10,
            include: {
              package: { select: { name: true, price: true, sessions: true } },
              usages: { select: { id: true } },
            },
          },
        },
      });

      if (!player) {
        return NextResponse.json({ error: "Player not found" }, { status: 404 });
      }

      const activeSub = player.subscriptions.find(
        (s) => s.status === "active" && s.expiresAt > new Date()
      ) ?? null;
      const linkedPlayer = await prisma.player.findFirst({
        where: { phone: player.phone },
        select: { facePhotoPath: true, avatarPhotoPath: true, reclubUserId: true },
      });

      const reclubProfile = linkedPlayer?.reclubUserId
        ? await fetchReclubProfile(linkedPlayer.reclubUserId)
        : null;

      return NextResponse.json({
        player: {
          id: player.id,
          source: "courtpay",
          name: player.name,
          phone: player.phone,
          gender: player.gender,
          skillLevel: player.skillLevel,
          facePhotoPath: linkedPlayer?.facePhotoPath ?? null,
          avatarPhotoPath: linkedPlayer?.avatarPhotoPath ?? null,
          reclubUserId: linkedPlayer?.reclubUserId ?? null,
          reclubName: reclubProfile?.name ?? null,
          reclubAvatarUrl: reclubProfile?.avatarUrl ?? null,
          venueName: player.venue.name,
          registeredAt: player.createdAt.toISOString(),
          checkInCount: player.checkIns.length,
          checkIns: player.checkIns.map((c) => ({
            id: c.id,
            checkedInAt: c.checkedInAt.toISOString(),
            source: c.source,
          })),
          activeSub: activeSub
            ? {
                id: activeSub.id,
                packageName: activeSub.package.name,
                packagePrice: activeSub.package.price,
                totalSessions: activeSub.package.sessions,
                sessionsRemaining: activeSub.sessionsRemaining,
                sessionsUsed: activeSub.usages.length,
                status: activeSub.status,
                activatedAt: activeSub.activatedAt.toISOString(),
                expiresAt: activeSub.expiresAt.toISOString(),
              }
            : null,
          subscriptionHistory: player.subscriptions.map((s) => ({
            id: s.id,
            packageName: s.package.name,
            status: s.status,
            activatedAt: s.activatedAt.toISOString(),
            expiresAt: s.expiresAt.toISOString(),
            sessionsUsed: s.usages.length,
            totalSessions: s.package.sessions,
          })),
        },
      });
    }

    // source === "self" — Self check-in player
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: {
        id: true,
        name: true,
        phone: true,
        gender: true,
        skillLevel: true,
        facePhotoPath: true,
        avatarPhotoPath: true,
        reclubUserId: true,
        createdAt: true,
        queueEntries: {
          orderBy: { joinedAt: "desc" },
          take: 50,
          select: {
            id: true,
            joinedAt: true,
            session: { select: { venue: { select: { name: true } } } },
          },
        },
      },
    });

    if (!player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    const venueName = player.queueEntries[0]?.session?.venue?.name ?? "—";

    const selfReclubProfile = player.reclubUserId
      ? await fetchReclubProfile(player.reclubUserId)
      : null;

    return NextResponse.json({
      player: {
        id: player.id,
        source: "self",
        name: player.name,
        phone: player.phone,
        gender: player.gender,
        skillLevel: player.skillLevel,
        facePhotoPath: player.facePhotoPath,
        avatarPhotoPath: player.avatarPhotoPath,
        reclubUserId: player.reclubUserId ?? null,
        reclubName: selfReclubProfile?.name ?? null,
        reclubAvatarUrl: selfReclubProfile?.avatarUrl ?? null,
        venueName,
        registeredAt: player.createdAt.toISOString(),
        checkInCount: player.queueEntries.length,
        checkIns: player.queueEntries.map((e) => ({
          id: e.id,
          checkedInAt: e.joinedAt.toISOString(),
          source: "self",
        })),
        activeSub: null,
        subscriptionHistory: [],
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status =
      message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(req: Request) {
  try {
    const staff = requireStaff(req.headers);
    const body = await req.json() as {
      playerId: string;
      source: "courtpay" | "self";
      name: string;
      phone: string;
      gender: string | null;
      skillLevel: string | null;
    };

    const { playerId, source, name, phone, gender, skillLevel } = body;

    if (!playerId || !name?.trim() || !phone?.trim()) {
      return NextResponse.json({ error: "playerId, name and phone are required" }, { status: 400 });
    }

    if (source === "courtpay") {
      // Fetch current record to get venueId
      const current = await prisma.checkInPlayer.findUnique({
        where: { id: playerId },
        select: { venueId: true, phone: true },
      });
      if (!current) {
        return NextResponse.json({ error: "Player not found" }, { status: 404 });
      }

      // Phone uniqueness check within the same venue (excluding self)
      if (phone.trim() !== current.phone) {
        const conflict = await prisma.checkInPlayer.findFirst({
          where: { phone: phone.trim(), venueId: current.venueId, NOT: { id: playerId } },
          select: { id: true },
        });
        if (conflict) {
          return NextResponse.json(
            { error: "This phone number is already registered to another player at this venue." },
            { status: 409 }
          );
        }
      }

      const updated = await prisma.checkInPlayer.update({
        where: { id: playerId },
        data: {
          name: name.trim(),
          phone: phone.trim(),
          gender: gender ?? null,
          skillLevel: skillLevel ?? null,
        },
        select: { id: true, name: true, phone: true, gender: true, skillLevel: true },
      });

      return NextResponse.json({ ok: true, player: updated });
    }

    // source === "self"
    const current = await prisma.player.findUnique({
      where: { id: playerId },
      select: { phone: true },
    });
    if (!current) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    // Phone is globally unique for Player table
    if (phone.trim() !== current.phone) {
      const conflict = await prisma.player.findFirst({
        where: { phone: phone.trim(), NOT: { id: playerId } },
        select: { id: true },
      });
      if (conflict) {
        return NextResponse.json(
          { error: "This phone number is already registered to another player." },
          { status: 409 }
        );
      }
    }

    // Map string values to enums — fall back gracefully
    const validGenders = ["male", "female", "other"] as const;
    const validSkills = ["beginner", "intermediate", "advanced", "pro"] as const;

    const genderVal = validGenders.includes(gender as typeof validGenders[number])
      ? (gender as typeof validGenders[number])
      : undefined;
    const skillVal = validSkills.includes(skillLevel as typeof validSkills[number])
      ? (skillLevel as typeof validSkills[number])
      : undefined;

    const updated = await prisma.player.update({
      where: { id: playerId },
      data: {
        name: name.trim(),
        phone: phone.trim(),
        ...(genderVal !== undefined ? { gender: genderVal } : {}),
        ...(skillVal !== undefined ? { skillLevel: skillVal } : {}),
      },
      select: { id: true, name: true, phone: true, gender: true, skillLevel: true },
    });

    return NextResponse.json({ ok: true, player: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status =
      message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
