import { NextRequest } from "next/server";
import { json, error, notFound } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { toDateKey } from "@/lib/date";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    requireStaff(request.headers);
    const { groupId } = await params;

    const group = await prisma.bookingGroup.findUnique({
      where: { id: groupId },
      include: {
        bookings: {
          include: { court: { select: { id: true, label: true } } },
        },
        player: { select: { id: true, name: true, phone: true } },
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
      status: group.status,
      playerId: group.playerId,
      player: group.player,
      bookings: group.bookings.map((b) => ({
        id: b.id,
        courtId: b.courtId,
        courtLabel: b.court.label,
        priceValue: b.priceValue,
        status: b.status,
      })),
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
