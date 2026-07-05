import { NextRequest } from "next/server";
import { json, error, notFound } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requirePortalAuth } from "@/lib/portal-auth";
import { toDateKey } from "@/lib/date";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const { playerId } = await requirePortalAuth(request);
    const { groupId } = await params;

    const group = await prisma.bookingGroup.findFirst({
      where: { id: groupId, playerId },
      include: {
        bookings: {
          include: { court: { select: { id: true, label: true } } },
        },
      },
    });

    if (!group) return notFound("Group booking not found");

    return json({
      id: group.id,
      date: toDateKey(group.date),
      startTime: group.startTime.toISOString(),
      endTime: group.endTime.toISOString(),
      totalPriceValue: group.totalPriceValue,
      paymentRef: group.paymentRef,
      paymentStatus: group.paymentStatus,
      holdExpiresAt: group.holdExpiresAt?.toISOString() ?? null,
      status: group.status,
      bookings: group.bookings.map((b) => ({
        id: b.id,
        courtId: b.courtId,
        courtLabel: b.court.label,
        priceValue: b.priceValue,
        status: b.status,
      })),
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required") return error(msg, 401);
    return error(msg, 500);
  }
}
