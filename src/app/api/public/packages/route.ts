import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { requirePortalAuth } from "@/lib/portal-auth";
import { getPortalVenueId } from "@/lib/venue-config";
import { createCreditPurchase } from "@/lib/coach-credit-purchase";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { playerId } = await requirePortalAuth(request);
    const body = await request.json();
    const { coachId, packageId, quantity, totalPrice, venueId: bodyVenueId } = body as {
      coachId: string;
      packageId: string;
      quantity: number;
      totalPrice: number;
      venueId?: string;
    };
    const venueId = bodyVenueId || getPortalVenueId();

    const result = await createCreditPurchase(playerId, {
      coachId,
      packageId,
      quantity,
      totalPrice,
      venueId,
    });

    return json(result, 201);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required") return error(msg, 401);
    if (msg === "Package not found") return error(msg, 404);
    return error(msg, 500);
  }
}
