import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requirePortalAuth } from "@/lib/portal-auth";

export async function GET(request: NextRequest) {
  try {
    const { playerId } = await requirePortalAuth(request);

    const player = await prisma.player.findUniqueOrThrow({
      where: { id: playerId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        gender: true,
        skillLevel: true,
        avatarPhotoPath: true,
        facePhotoPath: true,
        registrationVenueId: true,
        registrationVenue: { select: { id: true, name: true, location: true, timezone: true } },
        accounts: {
          select: { provider: true, image: true, email: true, emailVerified: true },
          take: 1,
        },
        coachCredits: {
          where: { paymentStatus: "paid" },
          select: {
            id: true,
            totalSessions: true,
            usedSessions: true,
            expiresAt: true,
            coach: { select: { name: true } },
          },
        },
        _count: {
          select: {
            bookings: {
              where: { status: "confirmed", startTime: { gte: new Date() } },
            },
          },
        },
      },
    });

    const account = player.accounts[0];
    const avatar = account?.image ?? player.avatarPhotoPath ?? player.facePhotoPath;
    const displayPhone =
      player.phone.startsWith("oauth_") || player.phone.startsWith("email_")
        ? null
        : player.phone;
    const isCredentialsAccount = account?.provider === "credentials";
    const emailVerified = isCredentialsAccount ? (account?.emailVerified ?? false) : true;

    return json({
      ...player,
      avatar,
      phone: displayPhone,
      upcomingBookings: player._count.bookings,
      emailVerified,
      isCredentialsAccount,
      venue: player.registrationVenue,
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required") return error(msg, 401);
    return error(msg, 500);
  }
}

/**
 * DELETE /api/public/account
 * Anonymises the Player record (PII scrubbed) and hard-deletes the PlayerAccount rows
 * (OAuth tokens / password hash). Bookings, payments, coach lessons are retained for
 * financial/operational records but no longer linked to identifiable data.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { playerId } = await requirePortalAuth(request);

    await prisma.$transaction(async (tx) => {
      // 1. Hard-delete OAuth / credential accounts (removes tokens & password hashes)
      await tx.playerAccount.deleteMany({ where: { playerId } });

      // 2. Scrub PII from the Player row — keep the row so FK references on
      //    bookings/payments/lessons remain valid.
      const anonymousPhone = `deleted_${playerId}`;
      await tx.player.update({
        where: { id: playerId },
        data: {
          name: "Deleted User",
          email: null,
          phone: anonymousPhone,
          faceSubjectId: null,
          facePhotoPath: null,
          avatarPhotoPath: null,
          notificationsEnabled: false,
        },
      });

      // 3. Remove push subscriptions (device tokens are PII)
      await tx.pushSubscription.deleteMany({ where: { playerId } });
    });

    return json({ deleted: true });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required") return error(msg, 401);
    return error(msg, 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { playerId } = await requirePortalAuth(request);
    const body = await request.json();
    const { name, phone, gender, skillLevel, venueId } = body as {
      name?: string;
      phone?: string;
      gender?: string;
      skillLevel?: string;
      venueId?: string;
    };

    const data: Record<string, unknown> = {};
    if (name) data.name = name;
    if (phone) data.phone = phone.replace(/\s+/g, "");
    if (gender && ["male", "female"].includes(gender)) data.gender = gender;
    if (skillLevel && ["beginner", "intermediate", "advanced", "pro"].includes(skillLevel))
      data.skillLevel = skillLevel;
    if (venueId) data.registrationVenueId = venueId;

    const updated = await prisma.player.update({
      where: { id: playerId },
      data,
    });

    return json(updated);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required") return error(msg, 401);
    if ((e as { code?: string }).code === "P2002") {
      return error("Phone number already in use", 409);
    }
    return error(msg, 500);
  }
}
