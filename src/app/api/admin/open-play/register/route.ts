import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireAdminAccess } from "@/lib/auth";
import { assertVenueAccess } from "@/lib/venue-scope";
import { createOpenPlayRegistration } from "@/lib/open-play";
import { parseDateKey } from "@/lib/date";
import { sendBookingEmail, wrapPaymentUrlWithMagicLogin } from "@/lib/email/send";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/open-play/register
 * Staff-side registration of a player for an open play session.
 * Body: { venueId, scheduleEntryId, date, playerId }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await await requireAdminAccess(request.headers);
    const body = await parseBody<{
      venueId: string;
      scheduleEntryId: string;
      date: string;
      playerId: string;
      discountPct?: number;
    }>(request);

    if (!body.venueId) return error("venueId required", 400);
    if (!body.scheduleEntryId) return error("scheduleEntryId required", 400);
    if (!body.date) return error("date required", 400);
    if (!body.playerId) return error("playerId required", 400);

    await assertVenueAccess(auth, body.venueId);

    const date = parseDateKey(body.date);
    const reg = await createOpenPlayRegistration(
      body.playerId,
      body.venueId,
      body.scheduleEntryId,
      date,
      body.discountPct
    );

    // Send staff_confirmed notification to player with payment link (non-fatal)
    const [player, venue] = await Promise.all([
      prisma.player.findUnique({ where: { id: body.playerId }, select: { name: true, email: true } }),
      prisma.venue.findUnique({ where: { id: body.venueId }, select: { name: true } }),
    ]);

    console.log(`[staffOpenPlayRegister] regId=${reg.id} player="${player?.name}" email=${player?.email ?? "NONE"}`);

    if (player?.email) {
      const appUrl = process.env.APP_URL ?? "";
      const rawPaymentUrl = `${appUrl}/book/open-play/pay/${reg.id}`;
      const paymentUrl = await wrapPaymentUrlWithMagicLogin(body.playerId, rawPaymentUrl);
      const dateStr = reg.date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
      const timeStr = `${reg.startTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – ${reg.endTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      console.log(`[staffOpenPlayRegister] sending email to=${player.email} paymentUrl=${rawPaymentUrl}`);
      void sendBookingEmail({
        to: player.email,
        playerName: player.name,
        bookingType: "open_play",
        emailType: "staff_confirmed",
        details: {
          venueName: venue?.name,
          date: dateStr,
          time: timeStr,
          amount: reg.priceValue,
          paymentUrl,
        },
      });
    } else {
      console.log(`[staffOpenPlayRegister] no email on player "${player?.name}" — skipping confirmation email`);
    }

    return json(reg, 201);
  } catch (e) {
    const err = e as Error & { status?: number };
    const msg = err.message;
    if (msg.includes("Unauthorized") || msg.includes("Missing")) return error(msg, 401);
    if (err.status === 409) return error(msg, 409);
    if (err.status === 404) return error(msg, 404);
    if (err.status === 400) return error(msg, 400);
    return error(msg, 500);
  }
}
