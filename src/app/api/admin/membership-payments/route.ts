import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    requireSuperAdmin(request.headers);
    const url = request.nextUrl;

    const membershipId = url.searchParams.get("membershipId");
    const venueId = url.searchParams.get("venueId");
    const status = url.searchParams.get("status");

    if (!membershipId && !venueId) {
      return error("membershipId or venueId is required", 400);
    }

    const where: Record<string, unknown> = {};
    if (membershipId) where.membershipId = membershipId;
    if (venueId) where.membership = { venueId };
    if (status) where.status = status;

    const payments = await prisma.membershipPayment.findMany({
      where,
      include: {
        membership: {
          include: {
            player: { select: { id: true, name: true, phone: true } },
            tier: { select: { id: true, name: true, priceInCents: true } },
          },
        },
      },
      orderBy: { periodStart: "desc" },
    });

    return json(payments);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
