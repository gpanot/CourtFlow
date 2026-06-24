import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requirePortalAuth } from "@/lib/portal-auth";
import { getPortalVenueId } from "@/lib/venue-config";
import { resolveOpenPlaySessions, createOpenPlayRegistration } from "@/lib/open-play";
import { parseDateKey } from "@/lib/date";
import { buildVietQRUrl } from "@/lib/vietqr";

export const dynamic = "force-dynamic";

/** GET /api/public/open-play?date=YYYY-MM-DD — List sessions for the venue (auth optional for browse) */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get("date");
    const venueId = searchParams.get("venueId") || getPortalVenueId();

    const date = dateStr
      ? (() => {
          const [y, m, d] = dateStr.split("-").map(Number);
          return new Date(y, m - 1, d);
        })()
      : new Date();
    date.setHours(0, 0, 0, 0);

    const sessions = await resolveOpenPlaySessions(venueId, date);
    return json(sessions.map((s) => ({
      ...s,
      startTime: s.startTime.toISOString(),
      endTime: s.endTime.toISOString(),
      players: s.players,
    })));
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

/** POST /api/public/open-play — Register a player for a session */
export async function POST(request: NextRequest) {
  try {
    const { playerId } = await requirePortalAuth(request);
    const body = await request.json() as {
      scheduleEntryId: string;
      date: string;
      venueId?: string;
    };

    if (!body.scheduleEntryId || !body.date) {
      return error("scheduleEntryId and date are required", 400);
    }
    const venueId = body.venueId || getPortalVenueId();

    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: { bankName: true, bankAccount: true, bankOwnerName: true },
    });
    if (!venue) return error("Venue not found", 404);

    const reg = await createOpenPlayRegistration(playerId, venueId, body.scheduleEntryId, parseDateKey(body.date));

    const qrUrl = buildVietQRUrl({
      bankBin: venue.bankName || "",
      accountNumber: venue.bankAccount || "",
      accountName: venue.bankOwnerName || "",
      amount: reg.priceValue,
      description: reg.paymentRef || "",
    });

    return json(
      {
        registration: reg,
        payment: {
          paymentRef: reg.paymentRef,
          holdExpiresAt: reg.holdExpiresAt?.toISOString(),
          qrUrl,
          amount: reg.priceValue,
          bankName: venue.bankName,
          bankAccount: venue.bankAccount,
          bankOwnerName: venue.bankOwnerName,
        },
      },
      201
    );
  } catch (e) {
    const err = e as Error & { status?: number };
    const msg = err.message;
    if (msg === "Authentication required") return error(msg, 401);
    if (err.status === 409) return error(msg, 409);
    if (err.status === 404) return error(msg, 404);
    if (err.status === 400) return error(msg, 400);
    return error(msg, 500);
  }
}
