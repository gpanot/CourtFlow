import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireManagerOrSuperAdmin } from "@/lib/auth";
import { assertVenueAccess } from "@/lib/venue-scope";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/open-play/registrations?venueId=&date=YYYY-MM-DD[&detail=full]
 *
 * Without ?detail=full → returns counts grouped by scheduleEntryId (used by schedule config).
 * With    ?detail=full → returns full per-player records for the bookings-for-date list.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = requireManagerOrSuperAdmin(request.headers);
    const { searchParams } = new URL(request.url);
    const venueId = searchParams.get("venueId");
    const dateStr = searchParams.get("date");
    const detail = searchParams.get("detail");

    if (!venueId) return error("venueId required", 400);
    await assertVenueAccess(auth, venueId);

    const dateKey = dateStr ? dateStr.split("T")[0] : (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();
    const date = new Date(dateKey + "T12:00:00+07:00");

    if (detail === "full") {
      // Full records for the bookings-for-date section
      const regs = await prisma.openPlayRegistration.findMany({
        where: {
          venueId,
          date,
          status: { not: "cancelled" },
        },
        include: {
          player: { select: { id: true, name: true, phone: true } },
        },
        orderBy: { startTime: "asc" },
      });
      return json(regs);
    }

    // Default: counts grouped by scheduleEntryId (existing behaviour)
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
