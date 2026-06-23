import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireManagerOrSuperAdmin } from "@/lib/auth";
import { assertVenueAccess } from "@/lib/venue-scope";
import { toDbDate, toDateKey } from "@/lib/date";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/open-play/registrations?venueId=&date=YYYY-MM-DD
 * Returns counts of active registrations grouped by scheduleEntryId for a given date.
 * Used by admin schedule config to display "12/16 booked" on each entry.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = requireManagerOrSuperAdmin(request.headers);
    const { searchParams } = new URL(request.url);
    const venueId = searchParams.get("venueId");
    const dateStr = searchParams.get("date");

    if (!venueId) return error("venueId required", 400);
    await assertVenueAccess(auth, venueId);

    const date = dateStr ? toDbDate(dateStr) : toDbDate(toDateKey(new Date()));

    const regs = await prisma.openPlayRegistration.findMany({
      where: {
        venueId,
        date,
        status: "confirmed",
        OR: [
          { paymentStatus: { in: ["proof_submitted", "paid"] } },
          { paymentStatus: "pending", holdExpiresAt: { gt: new Date() } },
        ],
      },
      select: { scheduleEntryId: true },
    });

    const counts: Record<string, number> = {};
    for (const r of regs) {
      counts[r.scheduleEntryId] = (counts[r.scheduleEntryId] || 0) + 1;
    }

    return json(counts);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("Unauthorized") || msg.includes("Missing")) return error(msg, 401);
    return error(msg, 500);
  }
}
