import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireManagerOrSuperAdmin } from "@/lib/auth";
import { assertVenueAccess } from "@/lib/venue-scope";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireManagerOrSuperAdmin(request.headers);
    const { id } = await params;

    const reg = await prisma.openPlayRegistration.findUnique({ where: { id } });
    if (!reg) return error("Registration not found", 404);

    await assertVenueAccess(auth, reg.venueId);

    if (reg.paymentStatus !== "proof_submitted") {
      return error(`Cannot approve: payment status is "${reg.paymentStatus}", expected "proof_submitted"`, 400);
    }

    const updated = await prisma.openPlayRegistration.update({
      where: { id },
      data: { paymentStatus: "paid", holdExpiresAt: null },
      include: { player: { select: { name: true } } },
    });

    return json(updated);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("Unauthorized") || msg.includes("Missing")) return error(msg, 401);
    return error(msg, 500);
  }
}
