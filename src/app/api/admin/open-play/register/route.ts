import { NextRequest } from "next/server";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireManagerOrSuperAdmin } from "@/lib/auth";
import { assertVenueAccess } from "@/lib/venue-scope";
import { createOpenPlayRegistration } from "@/lib/open-play";
import { parseDateKey } from "@/lib/date";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/open-play/register
 * Staff-side registration of a player for an open play session.
 * Body: { venueId, scheduleEntryId, date, playerId }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = requireManagerOrSuperAdmin(request.headers);
    const body = await parseBody<{
      venueId: string;
      scheduleEntryId: string;
      date: string;
      playerId: string;
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
      date
    );

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
