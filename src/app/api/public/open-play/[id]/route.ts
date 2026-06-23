import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requirePortalAuth } from "@/lib/portal-auth";
import { sendBookingEmail } from "@/lib/email/send";
import { toDateKey } from "@/lib/date";

export const dynamic = "force-dynamic";

/** GET /api/public/open-play/[id] — Registration detail */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { playerId } = await requirePortalAuth(request);
    const { id } = await params;

    const reg = await prisma.openPlayRegistration.findFirst({
      where: { id, playerId },
      include: { venue: { select: { name: true, bankName: true, bankAccount: true, bankOwnerName: true } } },
    });
    if (!reg) return error("Registration not found", 404);

    return json({ ...reg, date: toDateKey(reg.date) });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required") return error(msg, 401);
    return error(msg, 500);
  }
}

/** DELETE /api/public/open-play/[id] — Cancel registration */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { playerId } = await requirePortalAuth(request);
    const { id } = await params;

    const reg = await prisma.openPlayRegistration.findFirst({
      where: { id, playerId, status: "confirmed" },
    });
    if (!reg) return error("Registration not found", 404);

    if (reg.paymentStatus === "paid") {
      return error("Cannot cancel a paid registration. Please contact the venue.", 400);
    }

    await prisma.openPlayRegistration.update({
      where: { id },
      data: { status: "cancelled", cancelledAt: new Date() },
    });

    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { name: true, email: true },
    });
    if (player?.email) {
      await sendBookingEmail({
        to: player.email,
        playerName: player.name,
        bookingType: "open_play",
        emailType: "cancelled",
        details: {},
      });
    }

    return json({ success: true });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required") return error(msg, 401);
    return error(msg, 500);
  }
}
